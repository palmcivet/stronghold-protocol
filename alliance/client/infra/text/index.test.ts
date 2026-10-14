import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dataName,
  errorText,
  setDataText,
  setLanguage,
  t,
  translateWire,
} from './index.js';

afterEach(() => {
  setLanguage('zh-Hans');
  setDataText({});
});

describe('t', () => {
  it('formats the Chinese source', () => {
    expect(t('core:room.heading', { code: 'ABCD' })).toBe('房间 ABCD');
  });

  it('uses the language pack and falls back to the source', () => {
    setLanguage('en');
    expect(t('core:lobby.create')).toBe('Create room');
    expect(t('core:bonds.heading')).toBe('盟约');
  });

  it('warns once in development about an English key it lacks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLanguage('en');
    t('core:field.empty');
    t('core:field.empty');
    expect(
      warn.mock.calls.filter((call) =>
        String(call[0]).includes('core:field.empty'),
      ),
    ).toHaveLength(1);
    setLanguage('zh-Hans');
    t('core:field.label');
    expect(
      warn.mock.calls.some((call) =>
        String(call[0]).includes('core:field.label'),
      ),
    ).toBe(false);
    warn.mockRestore();
  });

  it('reads data text', () => {
    setDataText({ 'data:chess.c1.name': '隐现' });
    expect(dataName('chess', 'c1')).toBe('隐现');
    expect(dataName('chess', 'c2')).toBe('c2');
  });
});

describe('master messages', () => {
  it('maps a msgid with a key to the player language', () => {
    expect(translateWire({ text: '资金不足', msgid: '资金不足' })).toBe(
      '资金不足',
    );
    expect(errorText('NO_FUNDS')).toBe('资金不足');
  });

  it('shows the text when no key matches', () => {
    expect(translateWire({ text: 'rec博士将调度中心等级提升为2级' })).toBe(
      'rec博士将调度中心等级提升为2级',
    );
    expect(errorText('SOMETHING', '服务器说')).toBe('服务器说');
  });
});
