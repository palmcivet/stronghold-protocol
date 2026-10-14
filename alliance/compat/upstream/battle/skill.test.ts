import { describe, expect, it } from 'vitest';
import { skillScriptOf, skillSpecOf } from './skill.js';

describe('skillSpecOf', () => {
  it('maps an ammo MANUAL skill with attribute mods', () => {
    const skill = skillSpecOf({
      skillId: 'skchr_inside_2',
      skillType: 'MANUAL',
      durationType: 'AMMO',
      duration: 0,
      spType: 'INCREASE_WITH_TIME',
      spCost: 24,
      initSp: 8,
      maxChargeTime: 1,
      bb: { atk: 0.8, base_attack_time: -0.3, 'attack@trigger_time': 14 },
      trigger: { rule: 'DEFAULT' },
    });
    expect(skill).toMatchObject({
      id: 'skchr_inside_2',
      body: 'ammo',
      ammo: 14,
      spType: 'time',
      operation: 'MANUAL',
      trigger: 'DEFAULT',
      spCost: 24,
      initSp: 8,
    });
    expect(skill?.mods).toEqual(
      expect.arrayContaining([
        { attribute: 'atk', op: 'percent', value: 0.8 },
        { attribute: 'atkInterval', op: 'add', value: -0.3 },
      ]),
    );
  });

  it('maps duration skills and unknown triggers to NEVER', () => {
    expect(
      skillSpecOf({
        skillId: 'skchr_yak_2',
        skillType: 'MANUAL',
        durationType: 'NONE',
        duration: 27,
        spType: 'INCREASE_WITH_TIME',
        spCost: 30,
        initSp: 10,
        bb: { max_hp: 0.3 },
        trigger: { rule: 'DEFAULT' },
      }),
    ).toMatchObject({ body: 'duration', duration: 27 });
    expect(
      skillSpecOf({
        skillId: 'sk_custom',
        skillType: 'MANUAL',
        durationType: 'NONE',
        duration: 0,
        spType: 'INCREASE_WITH_TIME',
        spCost: 10,
        trigger: { rule: 'MLYSS_WTRMAN' },
      })?.trigger,
    ).toBe('NEVER');
  });

  it('marks medic skills as heal and keeps blackboard in script', () => {
    expect(
      skillSpecOf(
        {
          skillId: 'skchr_vendla_2',
          skillType: 'MANUAL',
          durationType: 'NONE',
          duration: 20,
          spType: 'INCREASE_WITH_TIME',
          spCost: 40,
          bb: { atk: 0.55 },
          trigger: { rule: 'DEFAULT' },
        },
        { heal: true },
      ),
    ).toMatchObject({ heal: true, body: 'duration' });
    expect(
      skillScriptOf({
        skillId: 'sk',
        bb: { atk: 0.5, flag: true },
        trigger: { rule: 'DEFAULT' },
      }),
    ).toMatchObject({ atk: 0.5, flag: true, triggerRule: 'DEFAULT' });
  });
});
