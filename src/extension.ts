'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as Q from 'q';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    if (!process.env['PLANTUML_HOME'] || !process.env['JAVA_HOME']) {
        if (!process.env['PLANTUML_HOME']) { vscode.window.showErrorMessage('Set enviroment variable. PLANTUML_HOME.'); } 
        if (!process.env['JAVA_HOME']) { vscode.window.showErrorMessage('Set enviroment variable. JAVA_HOME.'); } 
        return;
    }

    // 定数
    const isDebug = !!process.env['OKAZUKIUML_DEBUG'];

    class FsUtils {
        public static mkdirExSync(dirPath: string): void {
            try {
                fs.mkdirSync(dirPath);
            } catch (e) {
                FsUtils.mkdirExSync(path.dirname(dirPath));
                FsUtils.mkdirExSync(dirPath);
            }
        }
    }

    class PlantUML {
        public static fromTextEditor(editor: vscode.TextEditor): PlantUML {
            return new PlantUML(
                path.dirname(editor.document.uri.fsPath),
                editor.document.getText().trim()
            );
        }

        private static plantUmlCommand = path.join(process.env['PLANTUML_HOME'], 'plantuml.jar');
        private static javaCommand = path.join(process.env['JAVA_HOME'], 'bin', 'java');

        constructor(private workDir: string, 
            private plantUmlText: string,
            private args: string[] = ['-p', '-tsvg', '-charset', 'utf-8']) {
        }

        public execute(): Q.Promise<string> {
            let params = ['-Duser.dir=' + this.workDir, '-Djava.awt.headless=true', '-jar', PlantUML.plantUmlCommand];
            params.push(...this.args);
            let process = child_process.spawn(PlantUML.javaCommand, params);
            process.stdin.write(this.plantUmlText);
            process.stdin.end();
            return Q.Promise<string>((resolve, reject, notify) => {
                var output = '';
                process.stdout.on('data', x => {
                    output += x;
                });
                process.stdout.on('close', () => {
                    resolve(output);
                });

                let stderror = '';
                process.stderr.on('data', x => {
                     stderror += x; 
                });
                process.stderr.on('close', () => {
                    if (isDebug && !!stderror) {
                        vscode.window.showErrorMessage(stderror);
                    }
                });
            });
        }
    }

    // ContentProvider
    class TextDocumentContentProvider implements vscode.TextDocumentContentProvider {
        private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

        private svg: string = '<svg></svg>';

        public provideTextDocumentContent(uri: vscode.Uri): string {
            return this.createPlantumlSnippet();
        }

        get onDidChange(): vscode.Event<vscode.Uri> {
            return this._onDidChange.event;
        }

        public update(uri: vscode.Uri, svg: string) {
            this.svg = svg;
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
            var r = '<body>' + this.svg + '</body>';
            return r;
        }

        private errorSnippet(text: string) {
            return `<body>
                <span>` + text + `</span>
            </body>`
        }
    }

    let provider = new TextDocumentContentProvider();
    let registration = vscode.workspace.registerTextDocumentContentProvider('plantuml-preview', provider);

    let previewUri = vscode.Uri.parse('plantuml-preview://authority/plantuml-preview');   

    let disposable = vscode.commands.registerCommand('extension.previewPlantUML', () => {
        let editor = vscode.window.activeTextEditor;
        var d = Q.defer();
        PlantUML.fromTextEditor(editor)
            .execute()
            .then(svg => {
                vscode.commands.executeCommand('vscode.previewHtml', previewUri, vscode.ViewColumn.Two, 'PlantUML Preview')
                    .then((success) => {
                        provider.update(previewUri, svg);
                        d.resolve(); 
                    }, (reason) => { 
                        vscode.window.showErrorMessage(reason); 
                        d.resolve();
                    });            
            })
        return d.promise;
    });

    let exportDisposable = vscode.commands.registerCommand('extension.exportPlantUML', () => {
        let editor = vscode.window.activeTextEditor;
        let exportPath = path.dirname(editor.document.uri.fsPath);
    });

    let saveTextDocumentDisposable = vscode.workspace.onDidSaveTextDocument((e: vscode.TextDocument) => {
        if (e === vscode.window.activeTextEditor.document) {
            PlantUML.fromTextEditor(vscode.window.activeTextEditor)
                .execute()
                .then(svg => {
                    provider.update(previewUri, svg);
                });
        }
    });

    let activeEditorChangedDisposable = vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor) => {
            PlantUML.fromTextEditor(editor)
                .execute()
                .then(svg => {
                    provider.update(previewUri, svg);
                });
    });

    // 変更時のプレビュー更新
    let changedTimestamp = new Date().getTime();
    let selectionChangedDisposable = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
        if (vscode.window.activeTextEditor.document !== e.document) { return; }
        changedTimestamp = new Date().getTime();
        setTimeout(() => {
            if (new Date().getTime() - changedTimestamp >= 400) {
                PlantUML.fromTextEditor(vscode.window.activeTextEditor)
                    .execute()
                    .then(svg => {
                        provider.update(previewUri, svg);
                    });
            }
        }, 500);
    });

    context.subscriptions.push(disposable, exportDisposable, saveTextDocumentDisposable, activeEditorChangedDisposable, selectionChangedDisposable);        
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

// this method is called when your extension is deactivated
export function deactivate() {
    let isDebug = !!process.env['OKAZUKIUML_DEBUG'];
    let outputPath = path.join(process.env['TEMP'], 'okazukiplantuml');
    fs.rmdir(outputPath, err => {
        if (isDebug) {
            if (err) {
                vscode.window.showErrorMessage(err.message);
            }
        }
    });
        
}