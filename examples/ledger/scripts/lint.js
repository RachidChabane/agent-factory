import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CHECKED_DIRECTORIES = ['src', 'test', 'scripts'];
const SOURCE_EXTENSION = '.js';
const NEWLINE = '\n';

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(SOURCE_EXTENSION) ? [path] : [];
  });
}

function problemsOf(path) {
  const text = readFileSync(path, 'utf8');
  const problems = [];
  if (!text.endsWith(NEWLINE)) problems.push(`${path}: the file does not end with a newline`);
  text.split(NEWLINE).forEach((line, index) => {
    if (/\s+$/.test(line)) problems.push(`${path}:${index + 1}: trailing whitespace`);
    if (path.startsWith('src') && /console\.log\(/.test(line)) problems.push(`${path}:${index + 1}: console.log in shipped code`);
  });
  return problems;
}

const problems = CHECKED_DIRECTORIES.flatMap(sourceFiles).flatMap(problemsOf);
for (const problem of problems) process.stderr.write(`${problem}${NEWLINE}`);
process.exitCode = problems.length === 0 ? 0 : 1;
