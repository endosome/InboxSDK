import { readUserInfo } from './user-info';

function render(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

const FULL = `<div id="xUserInfo" aria-hidden="true" style="display:none">
  <div id="xUserEmail">alice@example.com</div>
  <div id="xUserName"></div>
  <div id="xTimezone">Europe/Warsaw</div>
  <div id="xGmtOffset">7200000</div>
  <div id="xUserLocale">en</div>
</div>`;

test('reads every field', () => {
  expect(readUserInfo(render(FULL))).toEqual({
    emailAddress: 'alice@example.com',
    name: '',
    timeZone: 'Europe/Warsaw',
    gmtOffsetMinutes: 120,
    language: 'en',
  });
});

test('null until the node exists', () => {
  expect(readUserInfo(render(''))).toBe(null);
});

test('null while the email is not rendered yet', () => {
  expect(
    readUserInfo(
      render('<div id="xUserInfo"><div id="xUserEmail"></div></div>'),
    ),
  ).toBe(null);
});

test('negative offsets and missing optional fields', () => {
  const info = readUserInfo(
    render(`<div id="xUserInfo"><div id="xUserEmail">a@b.c</div>
      <div id="xGmtOffset">-25200000</div></div>`),
  );
  expect(info).toMatchObject({
    emailAddress: 'a@b.c',
    timeZone: null,
    gmtOffsetMinutes: -420,
    language: '',
  });
});
