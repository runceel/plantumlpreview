# okazuki PlantUML

Visual Studio Code PlantUML plugin.

PlantUML is [here](http://plantuml.com/).

## Features

PlantUML image previewer.

![Preview window](images/introduction.gif?raw=true)

### Commands
- `PlantUML Preview` : Start PlantUML preview.
- `PlantUML Export ***(*** is format type)` : Export png, svg, eps, etc... to same directory.

## Extension Settings

**Must** set enviroment variable.

- JAVA_HOME: Java SDK installed directory.(For example: C:\Program Files\Java\jdk1.8.0_101)
- PLANTUML_JAR: Path to plantuml.jar.(For example: C:\Users\UserName\bin\plantuml\plantuml.jar)

Optional.

- GRAPHVIZ_DOT: GraphViz's dot.exe position. see detail [PlantUML site](http://plantuml.com/graphvizdot.html).

## Known Issues

- Execute preview process all text file.

## Release Notes
### 0.1.8
- Fix typo

### 0.1.7
- Bug fix.

### 0.1.5
- Change setting method. PLANTUML_HOME -> PLANTUML_JAR

### 0.1.4
- Revert encoding setting method.
- Not lost focus when shown preview window.

### 0.1.3
- Change encoding setting method. Change -chaset to -Dfile.encoding.

### 0.1.2
- Refactor

### 0.1.1
- Change uml background color to white.

### 0.1.0
- Refactor
- Support many export format.
- No use TEMP env value.

### 0.0.13
- Support relative path include.

### 0.0.12
- Bugfix: Crush when init process(too...).

### 0.0.11
- Bugfix: Crush when init process.

### 0.0.10
- Correspondence to unsaved file.

### 0.0.9
- Realtime preview.

### 0.0.8
- Remove .exe extensions from java command. Maybe support Mac & Linux.

### 0.0.7
- More error message improvement.

### 0.0.6
- Error message improvement.

### 0.0.5
- Update preview window when changed active editor.

### 0.0.4
- Export png image.

### 0.0.3
- Hide PlantUML window.
- Support filename extension other than '.txt' 

### 0.0.2
- Set encoding utf-8

### 0.0.1
- First release.