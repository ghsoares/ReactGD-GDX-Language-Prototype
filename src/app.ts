import { GDXLexer, GDXParser } from "./GDXLanguage";

console.clear();

const source = `extends ReactGDComponent
class_name TestComponent

import AwesomeButton from "./awesomeButton.gdx";
`;

const lexer = new GDXLexer(source);
const parser = new GDXParser(lexer, {
	filePath: "scripts/test.gdx",
	fileBaseName: "test",
	folderPath: "scripts"
});
const parsed = parser.parse();

console.log(parsed);

