// Class definitions for 5 character classes
// Each class has: base stats, stat growth, unique skills info, visual config

export const CLASS_DEFINITIONS = {

    human: {
        id: 'human',
        name: '人类',
        icon: '⚔️',
        desc: '均衡发展的冒险者，没有明显短板，适合新手探索深渊。',
        baseStats:     { maxHp: 100, maxMp: 60,  atk: 10, def: 3,  spd: 180, crit: 0.05, critMult: 1.5, attackRange: 45, attackSpeed: 0.40, mpRegen: 3 },
        statGrowth:    { maxHp: 5,   maxMp: 3,   atk: 2,  def: 1,  spd: 0,   crit: 0.002, critMult: 0,   attackRange: 0,   attackSpeed: 0,    mpRegen: 0.1 },
        uniqueActiveSkillIds:  ['battle_cry', 'roundhouse'],
        uniquePassiveSkillIds: ['adaptability', 'unyielding', 'leadership'],
        forbiddenSharedActives:  [],
        forbiddenSharedPassives: [],
        startingWeaponPref: 'sword',
        visual: {
            bodyScale: 1.0, bodyColor: '#d4a574', bodyShape: 'circle',
            helmetStyle: 'default', eyeStyle: 'normal',
            accessories: { back: [], front: [] },
            trailColor: null, idleBob: false, scaleWeapon: 1.0
        }
    },

    saintess: {
        id: 'saintess',
        name: '圣女',
        icon: '✨',
        desc: '圣光的代言人，擅长治疗与防护，以纯净之力净化深渊。',
        baseStats:     { maxHp: 80,  maxMp: 90,  atk: 6,  def: 2,  spd: 160, crit: 0.03, critMult: 1.4, attackRange: 40, attackSpeed: 0.45, mpRegen: 6 },
        statGrowth:    { maxHp: 3,   maxMp: 6,   atk: 1,  def: 0.5,spd: 0,   crit: 0.001, critMult: 0,   attackRange: 0,   attackSpeed: 0,    mpRegen: 0.3 },
        uniqueActiveSkillIds:  ['holy_light', 'purification_aura', 'guardian_shield'],
        uniquePassiveSkillIds: ['light_affinity', 'faith_power', 'redemption', 'holy_nova'],
        forbiddenSharedActives:  ['shadow_step', 'clone_jutsu', 'berserk', 'whirlwind_slash', 'dash_slash'],
        forbiddenSharedPassives: ['lifesteal'],
        startingWeaponPref: 'wand',
        visual: {
            bodyScale: 0.9, bodyColor: '#f5e6d3', bodyShape: 'circle',
            helmetStyle: 'circlet', eyeStyle: 'glowing',
            accessories: { back: ['halo', 'robe_back'], front: ['robe_front'] },
            trailColor: null, idleBob: true, scaleWeapon: 0.8
        }
    },

    knight: {
        id: 'knight',
        name: '骑士',
        icon: '🛡️',
        desc: '重装堡垒，以钢铁之躯抵挡深渊的侵蚀，守护身后的队友。',
        baseStats:     { maxHp: 140, maxMp: 40,  atk: 8,  def: 6,  spd: 140, crit: 0.03, critMult: 1.3, attackRange: 40, attackSpeed: 0.50, mpRegen: 2 },
        statGrowth:    { maxHp: 8,   maxMp: 2,   atk: 1.5,def: 1.5,spd: 0,   crit: 0.001, critMult: 0,   attackRange: 0,   attackSpeed: 0,    mpRegen: 0.05 },
        uniqueActiveSkillIds:  ['shield_bash', 'iron_fortress', 'holy_charge'],
        uniquePassiveSkillIds: ['heavy_armor', 'block', 'shield_wall', 'counter'],
        forbiddenSharedActives:  ['chain_lightning', 'meteor', 'frost_nova'],
        forbiddenSharedPassives: ['agility'],
        startingWeaponPref: 'heavy',
        visual: {
            bodyScale: 1.25, bodyColor: '#b0b0b8', bodyShape: 'roundedRect',
            helmetStyle: 'default', eyeStyle: 'normal',
            accessories: { back: [], front: ['shield'] },
            trailColor: null, idleBob: false, scaleWeapon: 1.15
        }
    },

    ninja: {
        id: 'ninja',
        name: '忍者',
        icon: '🥷',
        desc: '暗影中的舞者，以速度和致命一击闻名，在深渊中穿梭自如。',
        baseStats:     { maxHp: 75,  maxMp: 55,  atk: 12, def: 1,  spd: 220, crit: 0.12, critMult: 1.8, attackRange: 35, attackSpeed: 0.30, mpRegen: 3 },
        statGrowth:    { maxHp: 3,   maxMp: 2,   atk: 2.5,def: 0.5,spd: 0,   crit: 0.004, critMult: 0,   attackRange: 0,   attackSpeed: 0,    mpRegen: 0.1 },
        uniqueActiveSkillIds:  ['shadow_strike', 'smoke_bomb', 'shuriken_barrage'],
        uniquePassiveSkillIds: ['assassination', 'agility', 'weak_point', 'shadow_clone_passive'],
        forbiddenSharedActives:  ['berserk', 'thorns_aura', 'meteor'],
        forbiddenSharedPassives: ['iron_wall', 'diamond_body'],
        startingWeaponPref: 'dagger',
        visual: {
            bodyScale: 0.85, bodyColor: '#2c2c3a', bodyShape: 'circle',
            helmetStyle: 'hood', eyeStyle: 'mask',
            accessories: { back: ['scarf'], front: [] },
            trailColor: 'rgba(100,100,180,0.25)', idleBob: false, scaleWeapon: 0.9
        }
    },

    mage: {
        id: 'mage',
        name: '法师',
        icon: '🔮',
        desc: '奥术的掌控者，以强大的魔法轰击敌人，但身躯脆弱。',
        baseStats:     { maxHp: 65,  maxMp: 100, atk: 14, def: 1,  spd: 150, crit: 0.08, critMult: 1.6, attackRange: 55, attackSpeed: 0.45, mpRegen: 6 },
        statGrowth:    { maxHp: 2,   maxMp: 7,   atk: 3,  def: 0.3,spd: 0,   crit: 0.003, critMult: 0,   attackRange: 0,   attackSpeed: 0,    mpRegen: 0.3 },
        uniqueActiveSkillIds:  ['arcane_missiles', 'blizzard', 'mana_burst'],
        uniquePassiveSkillIds: ['arcane_intellect', 'elemental_mastery', 'mana_shield', 'arcane_storm'],
        forbiddenSharedActives:  ['thorns_aura', 'whirlwind_slash', 'dash_slash'],
        forbiddenSharedPassives: ['fortitude', 'iron_wall'],
        startingWeaponPref: 'wand',
        visual: {
            bodyScale: 0.9, bodyColor: '#d5c4e0', bodyShape: 'circle',
            helmetStyle: 'pointedHat', eyeStyle: 'glowing',
            accessories: { back: ['robe_back'], front: ['floating_orb', 'robe_front'] },
            trailColor: null, idleBob: true, scaleWeapon: 1.3
        }
    }

};

// Helper to get class by id
export function getClassDef(classId) {
    return CLASS_DEFINITIONS[classId] || CLASS_DEFINITIONS.human;
}

export const ALL_CLASS_IDS = ['human', 'saintess', 'knight', 'ninja', 'mage'];
