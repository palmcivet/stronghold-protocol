// @vitest-environment jsdom

import { EMPTY_CATALOG } from '@alliance/contract/catalog.js';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { IntentBus } from '#infra/intent/bus.js';
import { catalogStore } from '#infra/store/catalog.js';
import { setDataText } from '#infra/text/index.js';
import { difficultyInfo } from '#part/difficulty.js';
import { variantLabel } from '#profile/parts.js';
import { renderPart } from '#test/support/part.js';

const MODES = {
  mode_single_normal: {
    id: 'mode_single_normal',
    type: 'SINGLE',
    difficulty: 'NORMAL',
    code: 'AC-2',
    lastRound: 14,
    hiddenRound: 15,
  },
  mode_single_funny: {
    id: 'mode_single_funny',
    type: 'SINGLE',
    difficulty: 'FUNNY',
    code: 'AC-1',
    lastRound: 9,
    stages: 1,
  },
};

const bus: IntentBus = {
  dispatch: async () => ({ ok: true, reply: { t: 'ok' } }),
  preview: () => null,
  onOutcome: () => () => {},
};

afterEach(() => {
  cleanup();
  catalogStore.setState({ catalog: EMPTY_CATALOG, loaded: false });
  setDataText({});
});

describe('entry', () => {
  it('reads the difficulty cards from the mode data, the built-in text without it', () => {
    setDataText({
      'data:mode.mode_single_normal.desc': '数据说明',
      'data:mode.mode_single_normal.effects': '效果一\n效果二',
    });
    expect(difficultyInfo(MODES, 'solo', 'NORMAL')).toEqual({
      code: 'AC-2',
      desc: '数据说明',
      effects: ['效果一', '效果二'],
      rounds: 14,
      hidden: true,
      icon: null,
      stageNote: '战场随机（共8张）',
    });
    const funny = difficultyInfo(MODES, 'solo', 'FUNNY');
    expect(funny.rounds).toBe(9);
    expect(funny.hidden).toBe(false);
    expect(funny.desc).toBe('时长较短的模拟训练');
    expect(funny.stageNote).toBe('战场固定为 战场#01');
    expect(difficultyInfo({}, 'coop', 'HARD').rounds).toBeNull();
  });

  it('shows mode cards and the round count on the ladder', () => {
    catalogStore.setState({
      catalog: { ...EMPTY_CATALOG, modes: MODES },
      loaded: true,
    });
    renderPart('core:entry.create', { bus });
    expect(
      screen.getByText('独自调配资金与干员，以自己的节奏完成整场模拟。'),
    ).toBeTruthy();
    expect(screen.getByText('14 回合')).toBeTruthy();
    expect(screen.getByText('9 回合')).toBeTruthy();
    expect(screen.getByRole('button', { name: '开始独立模拟' })).toBeTruthy();
  });

  it('turns the tips with the buttons and hides the bar without tips', () => {
    const { unmount } = renderPart('core:entry.tips');
    expect(screen.queryByRole('complementary')).toBeNull();
    unmount();
    catalogStore.setState({
      catalog: { ...EMPTY_CATALOG, tips: ['0', '1'] },
      loaded: true,
    });
    setDataText({ 'data:tip.0': '提示一', 'data:tip.1': '提示二' });
    renderPart('core:entry.tips');
    expect(screen.getByText('提示一')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '下一条' }));
    expect(screen.getByText('提示二')).toBeTruthy();
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('names avatar variants by their catalog label', () => {
    expect(variantLabel('elite2', '陈')).toBe('陈·精英2');
    expect(variantLabel('skin', '陈')).toBe('陈·时装');
    expect(variantLabel('unknown', '陈')).toBe('陈·其他');
  });
});
