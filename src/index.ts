console.clear();

import { GDXLexer, GDXParser } from "./language/GDXLanguage";
import fs from "fs";
import path from "path";
import glob from "glob";
import ChildProcess from "child_process";
import { ParseError } from "./language/parser";

function test() {
    glob.glob("**/*.gdx.test", (err, files) => {
        if (err) throw err;

        let numTests = files.length;
        let tested = 0;
        let succeeded = 0;
        let elapsed = 0;

        const lexer = new GDXLexer();
        const parser = new GDXParser(lexer);

        for (const file of files) {
            const fileContent = fs.readFileSync(file, "utf8");
            let [_, input, expected] = fileContent.split(
                /---Input---|---Expected---/g
            );

            input = input.trim().replace(/\r\n/g, "\n");
            expected = expected.trim().replace(/\r\n/g, "\n");

            console.log(`----Test ${tested + 1}/${numTests}----`);
            console.log(`File path: ${file}`);

            try {
                const folder = path.dirname(file);
                const baseName = path.basename(file, ".gdx.test");

                const start = Date.now();
                const parsed = parser.parse(input, {
                    filePath: file,
                    fileBaseName: baseName,
                    folderPath: folder
                });
                elapsed += Date.now() - start;

                if (parsed === expected) {
                    console.log("Successfull");
                    succeeded++;
                } else {
                    console.log(`Failed, opening diff editor...`);

                    const expectedFilePath = file + ".expected";
                    const outputFilePath = file + ".output";
                    fs.writeFileSync(expectedFilePath, expected, "utf8");
                    fs.writeFileSync(outputFilePath, parsed, "utf8");
                    ChildProcess.exec(`code -d ${expectedFilePath} ${outputFilePath}`);
                }
            } catch (e) {
                if (e instanceof ParseError) {
                    console.log(`Failed with error`);
                    console.log(e.stack);
                }
            }
            console.log("");
            tested++;
        }

        console.log(`\nSucceeded: ${succeeded}/${numTests}`);
        console.log(
            `Total elapsed: ${elapsed} ms, Mean time: ${
                (elapsed / numTests).toFixed(0)
            } ms/file`
        );
    });
}

test();

