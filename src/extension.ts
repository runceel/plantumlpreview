'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as Q from 'q';
import * as fs from 'fs';

const isDebug = !!process.env['OKAZUKIUML_DEBUG'];

export function activate(context: vscode.ExtensionContext) {
    new OkazukiPlantUML.PlantUMLExtension(context).initialize();
}

export function deactivate() {
}

module OkazukiPlantUML {
    export class PlantUMLExtension {
        private provider = new TextDocumentContentProvider();

        constructor(private context: vscode.ExtensionContext) {}

        public initialize() {
            if ((!!process.env['PLANTUML_HOME'] || !!process.env['PLANTUML_JAR']) && !!process.env['JAVA_HOME']) {
                this.registerTextProvider();
                this.registerCommands();
                this.registerDocumentChangedWatcher();
            } else {
                if (!process.env['PLANTUML_HOME'] || !process.env['PLANTUML_JAR']) { vscode.window.showErrorMessage('Set enviroment variable. PLANTUML_HOME or PLANTUML_JAR.'); } 
                if (!process.env['JAVA_HOME']) { vscode.window.showErrorMessage('Set enviroment variable. JAVA_HOME.'); } 
            }
        }

        private registerTextProvider(): void {
            let registration = vscode.workspace.registerTextDocumentContentProvider('plantuml-preview', this.provider);
            this.context.subscriptions.push(registration);
        }

        private registerCommands(): void {
            let disposable = vscode.commands.registerCommand('extension.previewPlantUML', () => {
                let editor = vscode.window.activeTextEditor;
                return vscode.commands.executeCommand('vscode.previewHtml', TextDocumentContentProvider.previewUri, vscode.ViewColumn.Two, 'PlantUML Preview')
                    .then((success) => {
                        this.provider.update(TextDocumentContentProvider.previewUri);
                        vscode.window.showTextDocument(editor.document);
                    }, (reason) => { 
                        vscode.window.showErrorMessage(reason); 
                    });            
            });
            let disposables = ExportCommandManager.registerExportCommands();
            this.context.subscriptions.push(disposable, ...disposables);
        }

        private registerDocumentChangedWatcher(): void {
            let activeEditorChangedDisposable = vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor) => {
                this.provider.update(TextDocumentContentProvider.previewUri);
            });

            // update preview
            let changedTimestamp = new Date().getTime();
            let textDocumentChangedDisposable = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
                if (vscode.window.activeTextEditor.document !== e.document) { return; }
                changedTimestamp = new Date().getTime();
                setTimeout(() => {
                    if (new Date().getTime() - changedTimestamp >= 400) {
                        this.provider.update(TextDocumentContentProvider.previewUri);
                    }
                }, 500);
            });

            this.context.subscriptions.push(activeEditorChangedDisposable, textDocumentChangedDisposable);
        }
    }

    class PlantUMLExportFormat {
        constructor(public label: string,
            public format: string) {
        }
    }

    class PlantUML {
        public static fromTextEditor(editor: vscode.TextEditor): PlantUML {
            return new PlantUML(
                path.dirname(editor.document.uri.fsPath),
                editor.document.getText().trim(),
                ['-p', '-tpng']
            );
        }

        public static fromExportFormat(inputPath: string,format: PlantUMLExportFormat, outputPath: string): PlantUML {
            return new PlantUML(
                path.dirname(inputPath),
                null,
                [inputPath, format.format, '-o', outputPath]
            );
        }

        private static plantUmlCommand = !!process.env['PLANTUML_JAR'] ?
            process.env['PLANTUML_JAR'] :
            path.join(process.env['PLANTUML_HOME'], 'plantuml.jar');
        private static javaCommand = path.join(process.env['JAVA_HOME'], 'bin', 'java');

        constructor(private workDir: string, 
            private plantUmlText: string,
            private args) {
        }

        public execute(): Q.Promise<Buffer> {
            if (!path.isAbsolute(this.workDir)) {
                return Q.Promise<Buffer>((resolver, reject, notify) => {
                    reject("Please open folder and save file before export.");
                });
            }
            let params = ['-Duser.dir=' + this.workDir, '-Djava.awt.headless=true', '-jar', PlantUML.plantUmlCommand];
            params.push(...this.args);
            params.push('-charset', 'utf-8');
            console.log(params);
            let process = child_process.spawn(PlantUML.javaCommand, params);
            if (this.plantUmlText !== null) {
                process.stdin.write(this.plantUmlText);
                process.stdin.end();
            }

            return Q.Promise<Buffer>((resolve, reject, notify) => {
                let output:Buffer[] = [];
                let bufferLength = 0;
                process.stdout.on('data', (x: Buffer) => {
                    output.push(x);
                    bufferLength += x.length;
                });
                process.stdout.on('close', () => {
                    resolve(Buffer.concat(output, bufferLength));
                });

                let stderror = '';
                process.stderr.on('data', x => {
                     stderror += x; 
                });
                process.stderr.on('close', () => {
                    if (isDebug && !!stderror) {
                        vscode.window.showErrorMessage(stderror);
                    }
                    if (!!stderror) {
                        console.log(stderror);
                    }
                });
            });
        }
    }

    // ContentProvider
    class TextDocumentContentProvider implements vscode.TextDocumentContentProvider {
       public static previewUri = vscode.Uri.parse('plantuml-preview://authority/plantuml-preview');   
       private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

        public provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
            return this.createPlantumlSnippet();
        }

        get onDidChange(): vscode.Event<vscode.Uri> {
            return this._onDidChange.event;
        }

        public update(uri: vscode.Uri) {
            this._onDidChange.fire(uri);
        }

        private createPlantumlSnippet(): string | Thenable<string> {
            let editor = vscode.window.activeTextEditor;
            if (!(editor.document.languageId === 'plaintext' || editor.document.languageId === 'restructuredtext' || editor.document.languageId === 'plantuml')) {
                return this.errorSnippet("not plaintext");
            }
            return this.extractSnippet();
        }

        private extractSnippet(): Thenable<string> {
            let editor = vscode.window.activeTextEditor;
            return PlantUML.fromTextEditor(editor)
                .execute()
                .then(x => 
                {
                    let base64 = x.toString('base64');
                    return `<body style="background-color:white;width:100%;height:100%;overflow:visible;"><img src="data:image/png;base64,${base64}"></img></body>`
                });
        }

        private errorSnippet(text: string) {
            return `<body><span>${text}</span></body>`
        }
    }

    class ExportCommandManager {
        private static formats = [
            new PlantUMLExportFormat('png', '-tpng'),
            new PlantUMLExportFormat('svg', '-tsvg'),
            new PlantUMLExportFormat('eps', '-teps'),
            new PlantUMLExportFormat('pdf', '-tpdf'),
            new PlantUMLExportFormat('vdx', '-tvdx'),
            new PlantUMLExportFormat('xmi', '-txmi'),
            new PlantUMLExportFormat('scxml', '-tscxml'),
            new PlantUMLExportFormat('html', '-thtml'),
            new PlantUMLExportFormat('txt', '-ttxt'),
            new PlantUMLExportFormat('utxt', '-tutxt'),
            new PlantUMLExportFormat('latex', '-tlatex'),
            new PlantUMLExportFormat('latex:nopreamble', '-tlatex:nopreamble'),
        ];

        public static registerExportCommands(): vscode.Disposable[] {
            let disposables: vscode.Disposable[] = [];
            ExportCommandManager.formats.forEach(x => {
                let d = vscode.commands.registerCommand('extension.exportPlantUML-' + x.label, () => {
                    let outputDefaultPath = path.dirname(vscode.window.activeTextEditor.document.uri.fsPath);
                    return vscode.window.showInputBox({ value: outputDefaultPath, prompt: "output folder path" })
                        .then((outputPath) => {
                            if (outputPath == null) {
                                // canceled
                                return Q.Promise<Buffer>((resolve, reject, notify) => {
                                    resolve(null);
                                });
                            }
                            if (outputPath == "") {
                                // if equals to defaultvalue,outputPath is passed empty string
                                outputPath = outputDefaultPath;
                            }
                            let command = PlantUML.fromExportFormat(
                                vscode.window.activeTextEditor.document.uri.fsPath,
                                x,
                                outputPath);
                            return command.execute();
                        })
                        .then(() =>{}, (reason) => {
                            vscode.window.showErrorMessage(reason);   
                        });
                });
                disposables.push(d);
            });
            return disposables;
        }
    }
}