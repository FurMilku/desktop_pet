/**
 * 手游/战斗向 GLB 中不适合桌面宠物的动画名称过滤
 */

import { isFlyDragClipName } from './fly-drag-clips';

/** 战斗、技能、剧情等剪辑名称模式（不含拖拽飞行三阶段） */
const COMBAT_CLIP_PATTERN =
  /fight_|skill_|attack|atk|battle|combat|cast_|_die\b|death|_hit|hurt|damage|stun|anger|fear|alert|godpets|jq\d|render_|knock|dodge|parry|block|burst|combo|ultimate|buff_|debuff|summon|charge_|rage|provoke|taunt|injured|down_|getup|revive|spawn_|despawn|enter_battle|exit_battle|weapon|shoot|fire_|magic_|spell_|pet_skill|active_skill|passive_skill|behit|behurt|strike|slash|punch|kick|whirl|shooting|aim_|reload|equip_|unequip/i;

/**
 * 是否为战斗/技能/剧情类动画（桌面宠物应完全排除）
 */
export function isCombatLikeClipName(name: string): boolean {
  if (isFlyDragClipName(name)) {
    return false;
  }
  return COMBAT_CLIP_PATTERN.test(name);
}
