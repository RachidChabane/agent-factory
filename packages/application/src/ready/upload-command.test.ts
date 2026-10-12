import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MEDIA_FILE_PLACEHOLDER, renderUploadCommand, uploadCommandProblems, uploadedLink } from './upload-command.ts';

describe('the upload command template', () => {
  it('has to hold the file placeholder', () => {
    expect(uploadCommandProblems(['share', '--public', MEDIA_FILE_PLACEHOLDER])).toEqual([]);
    expect(uploadCommandProblems(['share', `--file=${MEDIA_FILE_PLACEHOLDER}`])).toEqual([]);
    expect(uploadCommandProblems(['share', '--public'])).toEqual(['the command must contain {file}']);
  });

  it('puts the path of the file wherever the placeholder stands, in an argument of its own or inside one', () => {
    expect(renderUploadCommand(['share', '--file={file}', '{file}'], '/cache/a b.mp4')).toEqual(['share', '--file=/cache/a b.mp4', '/cache/a b.mp4']);
  });

  it('leaves any other brace alone', () => {
    expect(renderUploadCommand(['sh', '-c', 'echo {} {file}'], '/x')).toEqual(['sh', '-c', 'echo {} /x']);
  });
});

describe('the link an upload command printed', () => {
  it('is the last non-empty line', () => {
    expect(uploadedLink('Uploading…\nProgress 100%\nhttps://files.example.test/a.mp4\n\n')).toBe('https://files.example.test/a.mp4');
    expect(uploadedLink('  https://files.example.test/b.png  \r\n')).toBe('https://files.example.test/b.png');
  });

  it('may be a file address of the machine the factory runs on', () => {
    expect(uploadedLink('file:///tmp/uploads/a.mp4\n')).toBe('file:///tmp/uploads/a.mp4');
  });

  it('is none when the last line is not an http, https or file address', () => {
    expect(uploadedLink('')).toBeNull();
    expect(uploadedLink('\n \n')).toBeNull();
    expect(uploadedLink('uploaded to the shared drive')).toBeNull();
    expect(uploadedLink('https://files.example.test/a.mp4\ndone')).toBeNull();
    expect(uploadedLink('javascript:alert(1)')).toBeNull();
    expect(uploadedLink('ftp://files.example.test/a.mp4')).toBeNull();
    expect(uploadedLink('data:text/html,<p>x</p>')).toBeNull();
  });

  it('never returns a line that is not a web or file address', () => {
    fc.assert(
      fc.property(fc.string(), (output) => {
        const link = uploadedLink(output);
        return link === null || /^(https?|file):/.test(link);
      }),
    );
  });
});
