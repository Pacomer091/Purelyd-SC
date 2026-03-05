const { execSync } = require('child_process');
const fs = require('fs');

try {
    const oldMain = execSync('git show HEAD~1:main.js').toString();
    const functionsToExtract = ['showMenu', 'hideMenu', 'deleteSongById', 'openEditModal'];

    let results = '';

    functionsToExtract.forEach(func => {
        const regex = new RegExp(`(async\\s+)?function\\s+${func}\\s*\\([^{]*\\)\\s*{`, 'g');
        let match;
        while ((match = regex.exec(oldMain)) !== null) {
            let start = match.index;
            let braceCount = 1;
            let end = start + match[0].length;

            while (braceCount > 0 && end < oldMain.length) {
                if (oldMain[end] === '{') braceCount++;
                if (oldMain[end] === '}') braceCount--;
                end++;
            }

            results += oldMain.substring(start, end) + '\n\n';
        }
    });

    fs.writeFileSync('extracted_functions.js', results);
    console.log('Extracted functions to extracted_functions.js');
} catch (e) {
    console.error(e);
}
