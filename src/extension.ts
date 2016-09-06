'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as Q from 'q';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    if (!process.env['PLANTUML_HOME'] || !process.env['JAVA_HOME'] || !process.env['TEMP']) {
        if (!process.env['PLANTUML_HOME']) { vscode.window.showErrorMessage('Set enviroment variable. PLANTUML_HOME.'); } 
        if (!process.env['JAVA_HOME']) { vscode.window.showErrorMessage('Set enviroment variable. JAVA_HOME.'); } 
        if (!process.env['TEMP']) { vscode.window.showErrorMessage('Set enviroment variable. TEMP.'); } 
        return;
    }

    // 定数
    const isDebug = !!process.env['OKAZUKIUML_DEBUG'];
    const plantumlCommand = path.join(process.env['PLANTUML_HOME'], 'plantuml.jar');
    const javaCommand = path.join(process.env['JAVA_HOME'], 'bin', 'java');
    const outputPath = path.join(process.env['TEMP'], 'okazukiplantuml');
    try {
        fs.accessSync(outputPath);
    } catch (e) {
        fs.mkdirSync(outputPath);
    }
    
    // ContentProvider
    class TextDocumentContentProvider implements vscode.TextDocumentContentProvider {
        private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

        public provideTextDocumentContent(uri: vscode.Uri): string {
            return this.createPlantumlSnippet();
        }

        get onDidChange(): vscode.Event<vscode.Uri> {
            return this._onDidChange.event;
        }

        public update(uri: vscode.Uri) {
            this._onDidChange.fire(uri);
        }

        private createPlantumlSnippet() {
            let editor = vscode.window.activeTextEditor;
            if (!(editor.document.languageId === 'plaintext')) {
                return this.errorSnippet("not plaintext");
            }
            return this.extractSnippet();
        }

        private extractSnippet(): string {
            let editor = vscode.window.activeTextEditor;
            var r = `<body>
                <img src='file://` + path.join(outputPath, path.basename(editor.document.uri.fsPath, path.extname(editor.document.uri.fsPath))) + `.png?dummy=` + new Date().getTime() + `' />
            </body>`;
            return r;
        }

        private errorSnippet(text: string) {
            return `<body>
                <span>` + text + `</span>
            </body>`
        }
    }

    // editorの内容をプレビューする
    function executePreview(editor: vscode.TextEditor): Q.Promise<{}> {
        let q = Q.defer();
        let tempFilePath = path.join(outputPath,
            path.basename(vscode.workspace.rootPath),
            editor.document.uri.fsPath.substr(vscode.workspace.rootPath.length));
        try {
            fs.accessSync(path.dirname(tempFilePath));
        } catch (e) {
            mkdirExSync(path.dirname(tempFilePath));
        }

        fs.writeFile(tempFilePath, editor.document.getText(), (err) => {
            if (isDebug) {
                if (err) {
                    vscode.window.showErrorMessage(err.message);
                }
            }
            child_process.exec(buildPlantUMLCommand(javaCommand, plantumlCommand, outputPath, tempFilePath), (error, stdout, stderr) => {
                showDebugError(isDebug, error, stderr);
                provider.update(previewUri);
                q.resolve();
            });
        });

        return q.promise;
    }

    let provider = new TextDocumentContentProvider();
    let registration = vscode.workspace.registerTextDocumentContentProvider('plantuml-preview', provider);

    let previewUri = vscode.Uri.parse('plantuml-preview://authority/plantuml-preview');   

    let disposable = vscode.commands.registerCommand('extension.previewPlantUML', () => {
        let editor = vscode.window.activeTextEditor;
        var d = Q.defer();
        executePreview(editor).then(_ =>  {
            vscode.commands.executeCommand('vscode.previewHtml', previewUri, vscode.ViewColumn.Two, 'PlantUML Preview')
                .then((success) => {
                    provider.update(previewUri);
                    d.resolve(); 
                }, (reason) => { 
                    vscode.window.showErrorMessage(reason); 
                    d.resolve();
                });            
        });
        return d.promise;
    });

    let exportDisposable = vscode.commands.registerCommand('extension.exportPlantUML', () => {
        let editor = vscode.window.activeTextEditor;
        let exportPath = path.dirname(editor.document.uri.fsPath);
        child_process.exec(buildPlantUMLCommand(javaCommand, plantumlCommand, exportPath, editor.document.uri.fsPath), (error, stdout, stderr) => {});
    });

    let saveTextDocumentDisposable = vscode.workspace.onDidSaveTextDocument((e: vscode.TextDocument) => {
        if (e === vscode.window.activeTextEditor.document) {
            let editor = vscode.window.activeTextEditor;
            executePreview(editor);
        }
    });

    let activeEditorChangedDisposable = vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor) => {
        executePreview(editor);
    });

    // 変更時のプレビュー更新
    let changedTimestamp = new Date().getTime();
    let selectionChangedDisposable = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        if (vscode.window.activeTextEditor.document !== e.document) { return; }
        changedTimestamp = new Date().getTime();
        setTimeout(() => {
            if (new Date().getTime() - changedTimestamp >= 400) {
                executePreview(vscode.window.activeTextEditor);
            }
        }, 500);
    });

    context.subscriptions.push(disposable, exportDisposable, saveTextDocumentDisposable, activeEditorChangedDisposable, selectionChangedDisposable);        
}

function buildPlantUMLCommand(javaCommand: string, plantumlCommand: string, outputPath: string, targetPath: string) {
    return '"' + javaCommand + '" -Djava.awt.headless=true -jar "' + plantumlCommand + '" "' +
        targetPath + '" -o "' + outputPath + '" -charset utf-8';
}

function showDebugError(isDebug: boolean, error: Error, stderr: string) {
    if (!isDebug) { return; }
    if (error) {
        vscode.window.showErrorMessage(error.message);
    }

    if (stderr) {
        vscode.window.showErrorMessage(stderr);
    }        
}

// mkdir recurcive
function mkdirExSync(dirPath: string) {
    try {
        fs.mkdirSync(dirPath);
    } catch (e) {
        mkdirExSync(path.dirname(dirPath));
        mkdirExSync(dirPath);
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
    let isDebug = !!process.env['OKAZUKIUML_DEBUG'];
    let outputPath = path.join(process.env['TEMP'], 'okazukiplantuml');
    fs.rmdir(outputPath, err => {
        if (isDebug) {
            vscode.window.showErrorMessage(err.message);
        }
    });
        
}