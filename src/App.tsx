import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import './App.css'
import { isFirebaseConfigured } from './firebaseConfig'

type Screen = 'home' | 'missions' | 'growth' | 'techEditor' | 'loading' | 'countdown' | 'battle'
type Lane = 0 | 1 | 2
type Distance = 'far' | 'mid' | 'near'
type Track = Distance | 'player'
type Status = 'playing' | 'cleared' | 'defeated'
type WarningType = 'move-lane' | 'move-near' | 'move-far' | 'ranged' | 'melee' | 'unblockable' | 'weak'
type EffectType = 'player-shot' | 'player-hit' | 'player-fire' | 'enemy-bolt' | 'enemy-dash'
type IconKind =
  | 'move'
  | 'down'
  | 'up'
  | 'bolt'
  | 'slash'
  | 'danger'
  | 'fire'
  | 'guard'
  | 'left'
  | 'right'
  | 'shot'
  | 'star'
  | 'exp'
  | 'sp'
  | 'ice'
  | 'wind'
  | 'stone'
  | 'light'
  | 'dark'
  | 'water'

type CommandTone = 'move' | 'guard' | 'attack' | 'magic'
type RangeMode = 'front' | 'line' | 'exact'
type EffectStyle = 'slash' | 'arrow' | 'fire' | 'bolt' | 'ice' | 'wind' | 'stone' | 'light' | 'dark' | 'water'
type SkillTreeId = 'melee' | 'range' | 'fire' | 'ice' | 'bolt' | 'nature'
type GrowthTab = 'equip' | 'tree'
type LearnedCommandFilter = 'all' | 'equipped' | SkillTreeId

type Mission = {
  id: string
  name: string
  description: string
  strength: string
  rewardText: string
  rewardExp: number
  enemyHp: number
  enemyCount: number
  actionDelayMs: number
  warningMs: {
    move: number
    attack: number
  }
}

type CommandDefinition = {
  command: string
  title: string
  desc: string
  emoji: string
  icon: IconKind
  tone: CommandTone
  power?: number
  rangeMode?: RangeMode
  range?: number
  effectStyle?: EffectStyle
  cost?: number
  prereq?: string
  requiredLevel?: number
  tree?: SkillTreeId
  tier?: number
}

type ProfileState = {
  level: number
  exp: number
  expToNext: number
  skillPoints: number
  learned: string[]
  equipped: string[]
  missionWins: string[]
  missionRecords: Record<string, MissionRecord>
  daily: DailyState
  loginBonus: LoginBonusState
  weeklyStats: WeeklyStats
}

type MissionRecord = {
  clears: number
  bestStars: number
  bestHp: number
  bestTimeMs: number
  bestMissCommands: number
}

type DailyState = {
  lastLoginDate: string
  dailyRewardClaimedDate: string
  goalDate: string
  goalClears: number
  goalRewardClaimedDate: string
}

type LoginBonusState = {
  stampIndex: number
  lastClaimedDate: string
}

type WeeklyStats = {
  weekId: string
  clears: number
  highestStage: number
  totalStars: number
}

type MissionRewardSummary = {
  stars: number
  previousBestStars: number
  bestUpdated: boolean
  firstClear: boolean
  baseExp: number
  starBonusExp: number
  totalExp: number
  clearTimeMs: number
  remainingHp: number
  typedCommands: number
  missCommands: number
}

type Warning = {
  id: number
  enemyId: string
  type: WarningType
  phase: 'preview' | 'active'
  icon: IconKind
  label: string
  lane: Lane
  duration: number
  timeLeft: number
  damage: number
  guardable: boolean
  nextLane?: Lane
  nextDistance?: Distance
  weakness?: 'fire'
}

type EnemyState = {
  id: string
  hp: number
  maxHp: number
  lane: Lane
  distance: Distance
  warning?: Warning
  turn: number
  nextDelayMs: number
  flashMs: number
}

type BattleEffect = {
  id: number
  type: EffectType
  owner: 'player' | 'enemy'
  icon: IconKind
  lane: Lane
  fromTrack: Track
  toTrack: Track
  duration: number
  elapsed: number
  damage: number
  guardable: boolean
  weakness?: 'fire'
  command: string
  rangeMode?: RangeMode
  range?: number
  targetEnemyId?: string
}

type BattleState = {
  mission: Mission
  status: Status
  playerHp: number
  maxPlayerHp: number
  playerLane: Lane
  guardMs: number
  enemies: EnemyState[]
  effects: BattleEffect[]
  nextEventMs: number
  turn: number
  rewardApplied: boolean
  rewardSummary?: MissionRewardSummary
  playerFlashMs: number
  elapsedMs: number
  typedCommands: number
  missCommands: number
  clearTimeMs: number
}

type BattleAction =
  | { type: 'tick'; dt: number }
  | { type: 'command'; command: string; availableCommands: string[]; commandMeta: Record<string, CommandDefinition> }
  | { type: 'mark-reward-applied'; rewardSummary: MissionRewardSummary }

type AppUser = {
  uid: string
  email: string | null
  displayName: string | null
}

type SoundName = 'ui' | 'start' | 'move' | 'guard' | 'attack' | 'miss' | 'clear' | 'defeat'
type BgmMode = 'home' | 'missions' | 'growth' | 'loading' | 'battle' | 'admin'

function getBgmMode(screen: Screen): BgmMode {
  if (screen === 'home') return 'home'
  if (screen === 'missions') return 'missions'
  if (screen === 'growth') return 'growth'
  if (screen === 'loading' || screen === 'countdown') return 'loading'
  if (screen === 'battle') return 'battle'
  return 'admin'
}

const laneLabels = ['ひだり', 'まんなか', 'みぎ'] as const
const fixedCommands = ['left', 'right', 'guard']
const localProfileKey = 'typing-lane-rpg-profile-v1'
const localTechniquesKey = 'typing-lane-rpg-techniques-v4'
const localSoundKey = 'typing-lane-rpg-sound-v1'
const adminEmails = ((import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

const fixedCommandDefinitions: CommandDefinition[] = [
  { command: 'left', title: 'ひだりへ', desc: 'ひだりへ 1マス', emoji: '⬅️', icon: 'left', tone: 'move' },
  { command: 'right', title: 'みぎへ', desc: 'みぎへ 1マス', emoji: '➡️', icon: 'right', tone: 'move' },
  { command: 'guard', title: 'ガード', desc: 'つぎの 1げきを まもる', emoji: '🛡️', icon: 'guard', tone: 'guard' },
]

const defaultTechniqueDefinitions: CommandDefinition[] = [
  { command: 'hit', title: 'たたく', desc: '近くをすぐ攻撃', emoji: '🗡️', icon: 'slash', tone: 'attack', power: 12, rangeMode: 'front', range: 1, effectStyle: 'slash', tree: 'melee', tier: 0, cost: 0, requiredLevel: 1 },
  { command: 'shot', title: 'まっすぐショット', desc: '遠くまで弱くうつ', emoji: '🏹', icon: 'shot', tone: 'attack', power: 8, rangeMode: 'line', range: 3, effectStyle: 'arrow', tree: 'range', tier: 0, cost: 0, requiredLevel: 1 },
  { command: 'jab', title: 'はやづき', desc: '目の前へ軽い一撃', emoji: '🗡️', icon: 'slash', tone: 'attack', power: 14, rangeMode: 'front', range: 1, effectStyle: 'slash', tree: 'melee', tier: 1, cost: 1, prereq: 'hit', requiredLevel: 2 },
  { command: 'kick', title: 'けり', desc: '目の前をける', emoji: '🦶', icon: 'slash', tone: 'attack', power: 15, rangeMode: 'front', range: 1, effectStyle: 'wind', tree: 'melee', tier: 1, cost: 1, prereq: 'hit', requiredLevel: 2 },
  { command: 'slash', title: 'つよぎり', desc: '近くを強くきる', emoji: '⚔️', icon: 'slash', tone: 'attack', power: 20, rangeMode: 'line', range: 1, effectStyle: 'slash', tree: 'melee', tier: 1, cost: 1, prereq: 'hit', requiredLevel: 2 },
  { command: 'upper', title: 'うちあげ', desc: '近くを上へはじく', emoji: '⬆️', icon: 'up', tone: 'attack', power: 18, rangeMode: 'front', range: 1, effectStyle: 'wind', tree: 'melee', tier: 2, cost: 2, prereq: 'jab', requiredLevel: 4 },
  { command: 'stab', title: 'まっすぐづき', desc: '一直線に1マス', emoji: '🗡️', icon: 'slash', tone: 'attack', power: 22, rangeMode: 'line', range: 1, effectStyle: 'slash', tree: 'melee', tier: 2, cost: 2, prereq: 'jab', requiredLevel: 4 },
  { command: 'spin', title: 'ぐるぐるぎり', desc: '近くに大きく当てる', emoji: '🌀', icon: 'wind', tone: 'attack', power: 24, rangeMode: 'front', range: 1, effectStyle: 'wind', tree: 'melee', tier: 2, cost: 2, prereq: 'slash', requiredLevel: 5 },
  { command: 'dash', title: 'ふみこみ', desc: '一直線に2マス', emoji: '💨', icon: 'wind', tone: 'attack', power: 24, rangeMode: 'line', range: 2, effectStyle: 'wind', tree: 'melee', tier: 2, cost: 2, prereq: 'slash', requiredLevel: 5 },
  { command: 'cross', title: '十字ぎり', desc: '近くへ重い一撃', emoji: '❌', icon: 'slash', tone: 'attack', power: 32, rangeMode: 'line', range: 1, effectStyle: 'slash', tree: 'melee', tier: 3, cost: 3, prereq: 'spin', requiredLevel: 8 },
  { command: 'lance', title: 'ながやり', desc: '一直線に2マス', emoji: '🔱', icon: 'slash', tone: 'attack', power: 30, rangeMode: 'line', range: 2, effectStyle: 'slash', tree: 'melee', tier: 3, cost: 3, prereq: 'stab', requiredLevel: 8 },
  { command: 'smash', title: 'たたきわり', desc: '目の前だけ高威力', emoji: '🔨', icon: 'stone', tone: 'attack', power: 38, rangeMode: 'front', range: 1, effectStyle: 'stone', tree: 'melee', tier: 4, cost: 4, prereq: 'cross', requiredLevel: 12 },
  { command: 'rush', title: 'れんぞくづき', desc: '一直線に1マス', emoji: '⚔️', icon: 'slash', tone: 'attack', power: 36, rangeMode: 'line', range: 1, effectStyle: 'slash', tree: 'melee', tier: 4, cost: 4, prereq: 'lance', requiredLevel: 13 },
  { command: 'blade', title: '光のやいば', desc: '一直線に2マス', emoji: '🔆', icon: 'light', tone: 'attack', power: 40, rangeMode: 'line', range: 2, effectStyle: 'light', tree: 'melee', tier: 5, cost: 4, prereq: 'rush', requiredLevel: 16 },
  { command: 'counter', title: 'カウンター', desc: '目の前だけ強い', emoji: '🛡️', icon: 'guard', tone: 'attack', power: 42, rangeMode: 'front', range: 1, effectStyle: 'slash', tree: 'melee', tier: 5, cost: 5, prereq: 'smash', requiredLevel: 18 },
  { command: 'cleave', title: 'おおぎり', desc: '一直線に2マス', emoji: '🪓', icon: 'slash', tone: 'attack', power: 46, rangeMode: 'line', range: 2, effectStyle: 'slash', tree: 'melee', tier: 6, cost: 5, prereq: 'blade', requiredLevel: 22 },
  { command: 'skycut', title: '空ぎり', desc: '2マス先だけ', emoji: '🌤️', icon: 'wind', tone: 'attack', power: 50, rangeMode: 'exact', range: 2, effectStyle: 'wind', tree: 'melee', tier: 6, cost: 5, prereq: 'cleave', requiredLevel: 24 },
  { command: 'meteorcut', title: '流星ぎり', desc: '近くへ特大攻撃', emoji: '☄️', icon: 'fire', tone: 'attack', power: 56, rangeMode: 'front', range: 1, effectStyle: 'fire', tree: 'melee', tier: 7, cost: 6, prereq: 'cleave', requiredLevel: 27 },
  { command: 'heroslash', title: '勇者ぎり', desc: '一直線に2マス', emoji: '🌟', icon: 'star', tone: 'attack', power: 62, rangeMode: 'line', range: 2, effectStyle: 'light', tree: 'melee', tier: 8, cost: 7, prereq: 'meteorcut', requiredLevel: 30 },
  { command: 'arrow', title: 'やをはなつ', desc: '一直線に2マス', emoji: '🏹', icon: 'shot', tone: 'attack', power: 17, rangeMode: 'line', range: 2, effectStyle: 'arrow', tree: 'range', tier: 1, cost: 1, prereq: 'shot', requiredLevel: 2 },
  { command: 'longshot', title: 'ロングショット', desc: '一直線に3マス', emoji: '🏹', icon: 'shot', tone: 'attack', power: 18, rangeMode: 'line', range: 3, effectStyle: 'arrow', tree: 'range', tier: 1, cost: 1, prereq: 'shot', requiredLevel: 3 },
  { command: 'mark', title: 'ねらい印', desc: '3マス先だけ', emoji: '🎯', icon: 'shot', tone: 'attack', power: 22, rangeMode: 'exact', range: 3, effectStyle: 'arrow', tree: 'range', tier: 2, cost: 2, prereq: 'longshot', requiredLevel: 5 },
  { command: 'double', title: '二れんショット', desc: '一直線に2マス', emoji: '🏹', icon: 'shot', tone: 'attack', power: 25, rangeMode: 'line', range: 2, effectStyle: 'arrow', tree: 'range', tier: 2, cost: 2, prereq: 'arrow', requiredLevel: 5 },
  { command: 'powershot', title: 'ちからショット', desc: '一直線に3マス', emoji: '🎯', icon: 'shot', tone: 'attack', power: 28, rangeMode: 'line', range: 3, effectStyle: 'arrow', tree: 'range', tier: 3, cost: 3, prereq: 'double', requiredLevel: 8 },
  { command: 'snipe', title: 'ねらいうち', desc: '3マス先だけ', emoji: '🎯', icon: 'shot', tone: 'attack', power: 36, rangeMode: 'exact', range: 3, effectStyle: 'arrow', tree: 'range', tier: 3, cost: 3, prereq: 'mark', requiredLevel: 9 },
  { command: 'pierce', title: 'つきぬく矢', desc: '一直線に3マス', emoji: '🪡', icon: 'shot', tone: 'attack', power: 34, rangeMode: 'line', range: 3, effectStyle: 'arrow', tree: 'range', tier: 4, cost: 4, prereq: 'powershot', requiredLevel: 12 },
  { command: 'bomb', title: 'ばくだん', desc: '2マス先だけ', emoji: '💣', icon: 'danger', tone: 'attack', power: 42, rangeMode: 'exact', range: 2, effectStyle: 'stone', tree: 'range', tier: 4, cost: 4, prereq: 'powershot', requiredLevel: 13 },
  { command: 'boomerang', title: 'ブーメラン', desc: '一直線に2マス', emoji: '🪃', icon: 'wind', tone: 'attack', power: 35, rangeMode: 'line', range: 2, effectStyle: 'wind', tree: 'range', tier: 4, cost: 4, prereq: 'double', requiredLevel: 14 },
  { command: 'trap', title: 'わな', desc: '2マス先だけ', emoji: '🕳️', icon: 'dark', tone: 'attack', power: 44, rangeMode: 'exact', range: 2, effectStyle: 'dark', tree: 'range', tier: 5, cost: 5, prereq: 'bomb', requiredLevel: 17 },
  { command: 'cannon', title: '大砲', desc: '一直線に3マス', emoji: '💥', icon: 'danger', tone: 'attack', power: 48, rangeMode: 'line', range: 3, effectStyle: 'stone', tree: 'range', tier: 5, cost: 5, prereq: 'pierce', requiredLevel: 18 },
  { command: 'hawk', title: 'はやぶさ矢', desc: '3マス先だけ', emoji: '🪽', icon: 'shot', tone: 'attack', power: 50, rangeMode: 'exact', range: 3, effectStyle: 'wind', tree: 'range', tier: 6, cost: 5, prereq: 'snipe', requiredLevel: 21 },
  { command: 'rail', title: 'レールショット', desc: '一直線に3マス', emoji: '🚀', icon: 'light', tone: 'attack', power: 54, rangeMode: 'line', range: 3, effectStyle: 'light', tree: 'range', tier: 6, cost: 6, prereq: 'cannon', requiredLevel: 24 },
  { command: 'comet', title: 'すいせい弾', desc: '3マス先だけ', emoji: '☄️', icon: 'fire', tone: 'attack', power: 58, rangeMode: 'exact', range: 3, effectStyle: 'fire', tree: 'range', tier: 7, cost: 6, prereq: 'hawk', requiredLevel: 27 },
  { command: 'rainbow', title: 'にじの矢', desc: '一直線に3マス', emoji: '🌈', icon: 'light', tone: 'attack', power: 64, rangeMode: 'line', range: 3, effectStyle: 'light', tree: 'range', tier: 8, cost: 7, prereq: 'rail', requiredLevel: 30 },
  { command: 'fire', title: '小さなほのお', desc: '一直線に2マス', emoji: '🔥', icon: 'fire', tone: 'magic', power: 17, rangeMode: 'line', range: 2, effectStyle: 'fire', tree: 'fire', tier: 1, cost: 1, prereq: 'shot', requiredLevel: 2 },
  { command: 'sparkfire', title: '火花', desc: '2マス先だけ', emoji: '✨', icon: 'fire', tone: 'magic', power: 19, rangeMode: 'exact', range: 2, effectStyle: 'fire', tree: 'fire', tier: 1, cost: 1, prereq: 'fire', requiredLevel: 3 },
  { command: 'ember', title: 'ひのこ', desc: '一直線に2マス', emoji: '🔥', icon: 'fire', tone: 'magic', power: 22, rangeMode: 'line', range: 2, effectStyle: 'fire', tree: 'fire', tier: 2, cost: 2, prereq: 'fire', requiredLevel: 5 },
  { command: 'fireball', title: '火の玉', desc: '一直線に3マス', emoji: '☄️', icon: 'fire', tone: 'magic', power: 28, rangeMode: 'line', range: 3, effectStyle: 'fire', tree: 'fire', tier: 2, cost: 2, prereq: 'ember', requiredLevel: 6 },
  { command: 'flare', title: '赤い光', desc: '3マス先だけ', emoji: '🔴', icon: 'fire', tone: 'magic', power: 34, rangeMode: 'exact', range: 3, effectStyle: 'fire', tree: 'fire', tier: 3, cost: 3, prereq: 'fireball', requiredLevel: 9 },
  { command: 'flame', title: '大きなほのお', desc: '2マス先だけ', emoji: '🔥', icon: 'fire', tone: 'magic', power: 36, rangeMode: 'exact', range: 2, effectStyle: 'fire', tree: 'fire', tier: 3, cost: 3, prereq: 'fireball', requiredLevel: 10 },
  { command: 'burn', title: 'もえる風', desc: '一直線に2マス', emoji: '🌬️', icon: 'fire', tone: 'magic', power: 35, rangeMode: 'line', range: 2, effectStyle: 'fire', tree: 'fire', tier: 4, cost: 4, prereq: 'flame', requiredLevel: 13 },
  { command: 'volcano', title: '火山石', desc: '2マス先だけ', emoji: '🌋', icon: 'fire', tone: 'magic', power: 44, rangeMode: 'exact', range: 2, effectStyle: 'fire', tree: 'fire', tier: 4, cost: 4, prereq: 'flame', requiredLevel: 14 },
  { command: 'phoenix', title: 'ほのお鳥', desc: '一直線に3マス', emoji: '🐦‍🔥', icon: 'fire', tone: 'magic', power: 46, rangeMode: 'line', range: 3, effectStyle: 'fire', tree: 'fire', tier: 5, cost: 5, prereq: 'burn', requiredLevel: 17 },
  { command: 'magma', title: 'マグマ', desc: '1マス先だけ', emoji: '🌋', icon: 'fire', tone: 'magic', power: 48, rangeMode: 'exact', range: 1, effectStyle: 'fire', tree: 'fire', tier: 5, cost: 5, prereq: 'volcano', requiredLevel: 18 },
  { command: 'lava', title: 'よう岩', desc: '2マス先だけ', emoji: '🌋', icon: 'fire', tone: 'magic', power: 50, rangeMode: 'exact', range: 2, effectStyle: 'fire', tree: 'fire', tier: 5, cost: 5, prereq: 'volcano', requiredLevel: 20 },
  { command: 'sunray', title: '太陽光', desc: '3マス先だけ', emoji: '☀️', icon: 'light', tone: 'magic', power: 52, rangeMode: 'exact', range: 3, effectStyle: 'light', tree: 'fire', tier: 6, cost: 5, prereq: 'phoenix', requiredLevel: 21 },
  { command: 'inferno', title: 'ごうか', desc: '一直線に3マス', emoji: '🔥', icon: 'fire', tone: 'magic', power: 56, rangeMode: 'line', range: 3, effectStyle: 'fire', tree: 'fire', tier: 6, cost: 6, prereq: 'phoenix', requiredLevel: 23 },
  { command: 'starfire', title: '星の火', desc: '3マス先だけ', emoji: '🌟', icon: 'fire', tone: 'magic', power: 60, rangeMode: 'exact', range: 3, effectStyle: 'fire', tree: 'fire', tier: 7, cost: 6, prereq: 'sunray', requiredLevel: 26 },
  { command: 'solar', title: '太陽ほのお', desc: '一直線に3マス', emoji: '☀️', icon: 'fire', tone: 'magic', power: 62, rangeMode: 'line', range: 3, effectStyle: 'fire', tree: 'fire', tier: 7, cost: 6, prereq: 'inferno', requiredLevel: 28 },
  { command: 'dragon', title: 'ドラゴン火', desc: '一直線に3マス', emoji: '🐉', icon: 'fire', tone: 'magic', power: 66, rangeMode: 'line', range: 3, effectStyle: 'fire', tree: 'fire', tier: 8, cost: 7, prereq: 'inferno', requiredLevel: 30 },
  { command: 'ice', title: 'こおり', desc: '一直線に2マス', emoji: '🧊', icon: 'ice', tone: 'magic', power: 16, rangeMode: 'line', range: 2, effectStyle: 'ice', tree: 'ice', tier: 1, cost: 1, prereq: 'shot', requiredLevel: 2 },
  { command: 'snow', title: 'ゆき玉', desc: '2マス先だけ', emoji: '❄️', icon: 'ice', tone: 'magic', power: 18, rangeMode: 'exact', range: 2, effectStyle: 'ice', tree: 'ice', tier: 1, cost: 1, prereq: 'ice', requiredLevel: 3 },
  { command: 'frost', title: 'こおりづけ', desc: '2マス先だけ', emoji: '🧊', icon: 'ice', tone: 'magic', power: 25, rangeMode: 'exact', range: 2, effectStyle: 'ice', tree: 'ice', tier: 2, cost: 2, prereq: 'ice', requiredLevel: 5 },
  { command: 'icicle', title: 'つらら', desc: '一直線に3マス', emoji: '🧊', icon: 'ice', tone: 'magic', power: 27, rangeMode: 'line', range: 3, effectStyle: 'ice', tree: 'ice', tier: 2, cost: 2, prereq: 'frost', requiredLevel: 6 },
  { command: 'hail', title: 'ひょう', desc: '3マス先だけ', emoji: '🌨️', icon: 'ice', tone: 'magic', power: 32, rangeMode: 'exact', range: 3, effectStyle: 'ice', tree: 'ice', tier: 3, cost: 3, prereq: 'icicle', requiredLevel: 9 },
  { command: 'snowball', title: '大ゆき玉', desc: '一直線に2マス', emoji: '☃️', icon: 'ice', tone: 'magic', power: 34, rangeMode: 'line', range: 2, effectStyle: 'ice', tree: 'ice', tier: 3, cost: 3, prereq: 'frost', requiredLevel: 10 },
  { command: 'freezer', title: 'れいとう光', desc: '一直線に3マス', emoji: '🥶', icon: 'ice', tone: 'magic', power: 40, rangeMode: 'line', range: 3, effectStyle: 'ice', tree: 'ice', tier: 4, cost: 4, prereq: 'snowball', requiredLevel: 13 },
  { command: 'crystal', title: '水晶こおり', desc: '2マス先だけ', emoji: '💎', icon: 'ice', tone: 'magic', power: 43, rangeMode: 'exact', range: 2, effectStyle: 'ice', tree: 'ice', tier: 4, cost: 4, prereq: 'hail', requiredLevel: 14 },
  { command: 'mist', title: '白いきり', desc: '一直線に2マス', emoji: '🌫️', icon: 'ice', tone: 'magic', power: 42, rangeMode: 'line', range: 2, effectStyle: 'ice', tree: 'ice', tier: 4, cost: 4, prereq: 'snowball', requiredLevel: 15 },
  { command: 'glacier', title: '氷山', desc: '3マス先だけ', emoji: '🏔️', icon: 'ice', tone: 'magic', power: 48, rangeMode: 'exact', range: 3, effectStyle: 'ice', tree: 'ice', tier: 5, cost: 5, prereq: 'crystal', requiredLevel: 17 },
  { command: 'blizzard', title: 'ふぶき', desc: '一直線に3マス', emoji: '🌨️', icon: 'ice', tone: 'magic', power: 50, rangeMode: 'line', range: 3, effectStyle: 'ice', tree: 'ice', tier: 5, cost: 5, prereq: 'freezer', requiredLevel: 18 },
  { command: 'icefall', title: '氷の雨', desc: '2マス先だけ', emoji: '🌧️', icon: 'ice', tone: 'magic', power: 51, rangeMode: 'exact', range: 2, effectStyle: 'ice', tree: 'ice', tier: 5, cost: 5, prereq: 'mist', requiredLevel: 20 },
  { command: 'aurora', title: 'オーロラ', desc: '3マス先だけ', emoji: '🌌', icon: 'light', tone: 'magic', power: 53, rangeMode: 'exact', range: 3, effectStyle: 'light', tree: 'ice', tier: 6, cost: 5, prereq: 'glacier', requiredLevel: 21 },
  { command: 'iceblade', title: '氷のやいば', desc: '一直線に2マス', emoji: '🗡️', icon: 'ice', tone: 'magic', power: 55, rangeMode: 'line', range: 2, effectStyle: 'ice', tree: 'ice', tier: 6, cost: 6, prereq: 'blizzard', requiredLevel: 23 },
  { command: 'diamond', title: 'ダイヤこおり', desc: '2マス先だけ', emoji: '💎', icon: 'ice', tone: 'magic', power: 60, rangeMode: 'exact', range: 2, effectStyle: 'ice', tree: 'ice', tier: 7, cost: 6, prereq: 'aurora', requiredLevel: 26 },
  { command: 'absolute', title: 'ぜったいれいど', desc: '3マス先だけ', emoji: '❄️', icon: 'ice', tone: 'magic', power: 65, rangeMode: 'exact', range: 3, effectStyle: 'ice', tree: 'ice', tier: 8, cost: 7, prereq: 'diamond', requiredLevel: 30 },
  { command: 'bolt', title: 'いなずま', desc: '2マス先だけ', emoji: '⚡', icon: 'bolt', tone: 'magic', power: 18, rangeMode: 'exact', range: 2, effectStyle: 'bolt', tree: 'bolt', tier: 1, cost: 1, prereq: 'shot', requiredLevel: 3 },
  { command: 'spark', title: 'ひかり玉', desc: '一直線に2マス', emoji: '✨', icon: 'bolt', tone: 'magic', power: 20, rangeMode: 'line', range: 2, effectStyle: 'bolt', tree: 'bolt', tier: 1, cost: 1, prereq: 'bolt', requiredLevel: 4 },
  { command: 'zap', title: '小さな電気', desc: '1マス先だけ', emoji: '⚡', icon: 'bolt', tone: 'magic', power: 21, rangeMode: 'exact', range: 1, effectStyle: 'bolt', tree: 'bolt', tier: 1, cost: 1, prereq: 'bolt', requiredLevel: 5 },
  { command: 'shock', title: 'びりびり', desc: '1マス先だけ', emoji: '⚡', icon: 'bolt', tone: 'magic', power: 24, rangeMode: 'exact', range: 1, effectStyle: 'bolt', tree: 'bolt', tier: 2, cost: 2, prereq: 'bolt', requiredLevel: 6 },
  { command: 'charge', title: 'でんきため', desc: '一直線に2マス', emoji: '🔋', icon: 'bolt', tone: 'magic', power: 28, rangeMode: 'line', range: 2, effectStyle: 'bolt', tree: 'bolt', tier: 2, cost: 2, prereq: 'spark', requiredLevel: 7 },
  { command: 'thunder', title: 'らくらい', desc: '3マス先だけ', emoji: '🌩️', icon: 'bolt', tone: 'magic', power: 38, rangeMode: 'exact', range: 3, effectStyle: 'bolt', tree: 'bolt', tier: 3, cost: 3, prereq: 'charge', requiredLevel: 10 },
  { command: 'flash', title: 'まぶしい光', desc: '一直線に3マス', emoji: '🔆', icon: 'light', tone: 'magic', power: 34, rangeMode: 'line', range: 3, effectStyle: 'light', tree: 'bolt', tier: 3, cost: 3, prereq: 'spark', requiredLevel: 10 },
  { command: 'plasma', title: 'プラズマ', desc: '2マス先だけ', emoji: '🟣', icon: 'bolt', tone: 'magic', power: 42, rangeMode: 'exact', range: 2, effectStyle: 'bolt', tree: 'bolt', tier: 4, cost: 4, prereq: 'thunder', requiredLevel: 14 },
  { command: 'laser', title: 'レーザー', desc: '一直線に3マス', emoji: '🔦', icon: 'light', tone: 'magic', power: 44, rangeMode: 'line', range: 3, effectStyle: 'light', tree: 'bolt', tier: 4, cost: 4, prereq: 'flash', requiredLevel: 15 },
  { command: 'storm', title: '雷あらし', desc: '3マス先だけ', emoji: '⛈️', icon: 'bolt', tone: 'magic', power: 50, rangeMode: 'exact', range: 3, effectStyle: 'bolt', tree: 'bolt', tier: 5, cost: 5, prereq: 'plasma', requiredLevel: 18 },
  { command: 'magnet', title: 'じしゃく', desc: '2マス先だけ', emoji: '🧲', icon: 'bolt', tone: 'magic', power: 49, rangeMode: 'exact', range: 2, effectStyle: 'bolt', tree: 'bolt', tier: 5, cost: 5, prereq: 'plasma', requiredLevel: 19 },
  { command: 'chain', title: 'つながる雷', desc: '一直線に2マス', emoji: '⛓️', icon: 'bolt', tone: 'magic', power: 51, rangeMode: 'line', range: 2, effectStyle: 'bolt', tree: 'bolt', tier: 5, cost: 5, prereq: 'magnet', requiredLevel: 20 },
  { command: 'light', title: 'ひかりビーム', desc: '一直線に3マス', emoji: '🔆', icon: 'light', tone: 'magic', power: 52, rangeMode: 'line', range: 3, effectStyle: 'light', tree: 'bolt', tier: 6, cost: 5, prereq: 'laser', requiredLevel: 22 },
  { command: 'nova', title: 'ノヴァ', desc: '3マス先だけ', emoji: '💫', icon: 'light', tone: 'magic', power: 58, rangeMode: 'exact', range: 3, effectStyle: 'light', tree: 'bolt', tier: 6, cost: 6, prereq: 'storm', requiredLevel: 24 },
  { command: 'judgment', title: 'さばきの雷', desc: '3マス先だけ', emoji: '⚡', icon: 'bolt', tone: 'magic', power: 63, rangeMode: 'exact', range: 3, effectStyle: 'bolt', tree: 'bolt', tier: 7, cost: 6, prereq: 'nova', requiredLevel: 27 },
  { command: 'galaxy', title: '銀河ビーム', desc: '一直線に3マス', emoji: '🌌', icon: 'light', tone: 'magic', power: 68, rangeMode: 'line', range: 3, effectStyle: 'light', tree: 'bolt', tier: 8, cost: 7, prereq: 'judgment', requiredLevel: 30 },
  { command: 'wind', title: 'かぜ', desc: '一直線に2マス', emoji: '🌪️', icon: 'wind', tone: 'magic', power: 18, rangeMode: 'line', range: 2, effectStyle: 'wind', tree: 'nature', tier: 1, cost: 1, prereq: 'shot', requiredLevel: 3 },
  { command: 'water', title: 'みずでっぽう', desc: '一直線に2マス', emoji: '💧', icon: 'water', tone: 'magic', power: 17, rangeMode: 'line', range: 2, effectStyle: 'water', tree: 'nature', tier: 1, cost: 1, prereq: 'shot', requiredLevel: 3 },
  { command: 'leaf', title: 'このは', desc: '2マス先だけ', emoji: '🍃', icon: 'wind', tone: 'magic', power: 20, rangeMode: 'exact', range: 2, effectStyle: 'wind', tree: 'nature', tier: 1, cost: 1, prereq: 'wind', requiredLevel: 4 },
  { command: 'stone', title: 'いしおとし', desc: '2マス先だけ', emoji: '🪨', icon: 'stone', tone: 'magic', power: 24, rangeMode: 'exact', range: 2, effectStyle: 'stone', tree: 'nature', tier: 2, cost: 2, prereq: 'shot', requiredLevel: 5 },
  { command: 'gust', title: 'つよいかぜ', desc: '一直線に3マス', emoji: '💨', icon: 'wind', tone: 'magic', power: 26, rangeMode: 'line', range: 3, effectStyle: 'wind', tree: 'nature', tier: 2, cost: 2, prereq: 'wind', requiredLevel: 6 },
  { command: 'bubble', title: 'あわ', desc: '1マス先だけ', emoji: '🫧', icon: 'water', tone: 'magic', power: 25, rangeMode: 'exact', range: 1, effectStyle: 'water', tree: 'nature', tier: 2, cost: 2, prereq: 'water', requiredLevel: 6 },
  { command: 'wave', title: '大なみ', desc: '一直線に3マス', emoji: '🌊', icon: 'water', tone: 'magic', power: 34, rangeMode: 'line', range: 3, effectStyle: 'water', tree: 'nature', tier: 3, cost: 3, prereq: 'water', requiredLevel: 9 },
  { command: 'vine', title: 'つる', desc: '2マス先だけ', emoji: '🌿', icon: 'wind', tone: 'magic', power: 33, rangeMode: 'exact', range: 2, effectStyle: 'wind', tree: 'nature', tier: 3, cost: 3, prereq: 'leaf', requiredLevel: 10 },
  { command: 'quake', title: 'じしん', desc: '1マス先だけ', emoji: '🌋', icon: 'stone', tone: 'magic', power: 39, rangeMode: 'exact', range: 1, effectStyle: 'stone', tree: 'nature', tier: 3, cost: 3, prereq: 'stone', requiredLevel: 10 },
  { command: 'sand', title: 'すなあらし', desc: '一直線に2マス', emoji: '🏜️', icon: 'stone', tone: 'magic', power: 38, rangeMode: 'line', range: 2, effectStyle: 'stone', tree: 'nature', tier: 4, cost: 4, prereq: 'quake', requiredLevel: 13 },
  { command: 'tornado', title: 'たつまき', desc: '一直線に3マス', emoji: '🌪️', icon: 'wind', tone: 'magic', power: 43, rangeMode: 'line', range: 3, effectStyle: 'wind', tree: 'nature', tier: 4, cost: 4, prereq: 'gust', requiredLevel: 14 },
  { command: 'geyser', title: 'ふんすい', desc: '2マス先だけ', emoji: '⛲', icon: 'water', tone: 'magic', power: 44, rangeMode: 'exact', range: 2, effectStyle: 'water', tree: 'nature', tier: 4, cost: 4, prereq: 'wave', requiredLevel: 14 },
  { command: 'forest', title: '森の力', desc: '3マス先だけ', emoji: '🌳', icon: 'wind', tone: 'magic', power: 50, rangeMode: 'exact', range: 3, effectStyle: 'wind', tree: 'nature', tier: 5, cost: 5, prereq: 'vine', requiredLevel: 18 },
  { command: 'waterfall', title: 'たき', desc: '3マス先だけ', emoji: '🌊', icon: 'water', tone: 'magic', power: 52, rangeMode: 'exact', range: 3, effectStyle: 'water', tree: 'nature', tier: 5, cost: 5, prereq: 'geyser', requiredLevel: 19 },
  { command: 'earth', title: '大地の手', desc: '2マス先だけ', emoji: '🪨', icon: 'stone', tone: 'magic', power: 54, rangeMode: 'exact', range: 2, effectStyle: 'stone', tree: 'nature', tier: 6, cost: 5, prereq: 'sand', requiredLevel: 22 },
  { command: 'typhoon', title: 'たいふう', desc: '一直線に3マス', emoji: '🌀', icon: 'wind', tone: 'magic', power: 56, rangeMode: 'line', range: 3, effectStyle: 'wind', tree: 'nature', tier: 6, cost: 6, prereq: 'tornado', requiredLevel: 24 },
  { command: 'tsunami', title: 'つなみ', desc: '一直線に3マス', emoji: '🌊', icon: 'water', tone: 'magic', power: 62, rangeMode: 'line', range: 3, effectStyle: 'water', tree: 'nature', tier: 7, cost: 6, prereq: 'waterfall', requiredLevel: 27 },
  { command: 'gaia', title: 'ガイア', desc: '2マス先だけ', emoji: '🌎', icon: 'stone', tone: 'magic', power: 70, rangeMode: 'exact', range: 2, effectStyle: 'stone', tree: 'nature', tier: 8, cost: 7, prereq: 'earth', requiredLevel: 30 },
]

const commandDisplayNames: Record<string, string> = Object.fromEntries([...fixedCommandDefinitions, ...defaultTechniqueDefinitions].map((definition) => [definition.command, definition.title]))

const techniqueProgression: Record<string, Pick<CommandDefinition, 'tree' | 'tier' | 'cost' | 'prereq' | 'requiredLevel'>> = Object.fromEntries(
  defaultTechniqueDefinitions
    .filter((definition) => !['hit', 'shot'].includes(definition.command))
    .map((definition) => [
      definition.command,
      {
        tree: definition.tree,
        tier: definition.tier,
        cost: definition.cost,
        prereq: definition.prereq,
        requiredLevel: definition.requiredLevel,
      },
    ]),
)

const skillTreeInfo: Record<SkillTreeId, { title: string; icon: string; desc: string }> = {
  melee: { title: 'けんの道', icon: '🗡️', desc: '近くのてきをすばやく止める' },
  range: { title: 'ゆみの道', icon: '🏹', desc: '遠くのてきをねらってうつ' },
  fire: { title: 'ほのおの道', icon: '🔥', desc: '弱点をついて大ダメージ' },
  ice: { title: 'こおりの道', icon: '🧊', desc: '離れたマスを正確にねらう' },
  bolt: { title: 'かみなりの道', icon: '⚡', desc: '後半で強い一撃をおぼえる' },
  nature: { title: 'しぜんの道', icon: '🌿', desc: '風・石・水を使い分ける' },
}

const skillTreeOrder: SkillTreeId[] = ['melee', 'range', 'fire', 'ice', 'bolt', 'nature']

function getBalancedPower(technique: CommandDefinition) {
  if (!technique.power) return technique.power
  if (technique.command === 'hit') return 12
  if (technique.command === 'shot') return 8

  const tier = technique.tier ?? 1
  const tierBase = [12, 16, 22, 30, 38, 45, 52, 59, 66][Math.min(8, Math.max(0, tier))] ?? 16
  const rangeMode = technique.rangeMode ?? 'line'
  const range = technique.range ?? 1
  const rangeOffset =
    rangeMode === 'front'
      ? 2
      : rangeMode === 'exact'
        ? range === 1
          ? 3
          : range === 2
            ? -1
            : -4
        : range === 1
          ? 1
          : range === 2
            ? -3
            : -7
  const treeOffset = technique.tree === 'range' ? -1 : technique.tree === 'melee' ? 1 : 0

  return Math.max(6, tierBase + rangeOffset + treeOffset)
}

function balanceTechnique(technique: CommandDefinition): CommandDefinition {
  return {
    ...technique,
    power: getBalancedPower(technique),
  }
}

function normalizeTechnique(technique: CommandDefinition): CommandDefinition {
  const progression = techniqueProgression[technique.command]
  const title = !technique.title || technique.title === technique.command ? commandDisplayNames[technique.command] : technique.title
  if (technique.command === 'shot') {
    return balanceTechnique({
      ...technique,
      title: title ?? 'まっすぐショット',
      desc: '遠くまで弱くうつ',
      power: 8,
      rangeMode: 'line',
      range: 3,
      effectStyle: 'arrow',
      icon: 'shot',
      tree: 'range',
      tier: 0,
      cost: 0,
      requiredLevel: 1,
    })
  }
  if (!progression) return balanceTechnique({ ...technique, title: title ?? technique.title })
  return balanceTechnique({
    ...technique,
    title: title ?? technique.title,
    tree: progression.tree,
    tier: progression.tier,
    cost: progression.cost,
    prereq: progression.prereq,
    requiredLevel: progression.requiredLevel,
  })
}

function sortTechniques(definitions: CommandDefinition[]) {
  return [...definitions].sort(
    (a, b) =>
      skillTreeOrder.indexOf(a.tree ?? 'range') - skillTreeOrder.indexOf(b.tree ?? 'range') ||
      (a.tier ?? 1) - (b.tier ?? 1) ||
      (a.requiredLevel ?? 1) - (b.requiredLevel ?? 1) ||
      a.command.localeCompare(b.command),
  )
}

function mergeTechniqueDefinitions(overrides: CommandDefinition[]) {
  const merged = new Map(defaultTechniqueDefinitions.map((definition) => [definition.command, normalizeTechnique(definition)]))
  overrides
    .filter((technique) => technique?.command)
    .forEach((technique) => {
      const base = merged.get(technique.command)
      if (!base) return
      merged.set(technique.command, normalizeTechnique({ ...base, ...technique }))
    })
  return sortTechniques([...merged.values()])
}

const navItems = [
  { screen: 'home' as const, label: 'ホーム', emoji: '🏠' },
  { screen: 'missions' as const, label: 'ミッション', emoji: '🗺️' },
  { screen: 'growth' as const, label: '育成', emoji: '🌱' },
]

const missionThemes = [
  ['ひだまり草原', 'いちばん やさしい'],
  ['あおぞらの川', 'すこし はやい'],
  ['おかしの塔', 'かなり はやい'],
  ['かぜの丘', 'てきが よく うごく'],
  ['ほのおの森', '火のよこくが ふえる'],
  ['こおりの洞くつ', '中きょりが だいじ'],
  ['いなずま橋', 'ガードの はんだん'],
  ['石ころ山道', '目の前だけを ねらう'],
  ['みずうみの道', '遠くから せめる'],
  ['月あかり平原', 'よこくが みじかい'],
  ['からくり庭園', '移動が ふえる'],
  ['星ふる台地', '射程を えらぶ'],
  ['黒雲の門', 'ガードできない攻撃'],
  ['王さまの塔', 'すばやい はんだん'],
  ['ドラゴンの広場', 'はじめての強敵'],
  ['ふたご岩', 'てきが 2体 でる'],
  ['水晶の森', '2体の位置を よむ'],
  ['夕やけ砦', 'ガードと回避を 使い分ける'],
  ['雷雲ロード', '遠くのてきを ねらう'],
  ['マグマの橋', 'すばやい予告に 注意'],
  ['雪どけ谷', '近くと遠くを えらぶ'],
  ['古代の広場', '3体が ならぶ'],
  ['月の庭', '移動予告が 多い'],
  ['風車の町', '横移動を 見のがさない'],
  ['深海トンネル', '2マス先だけが 役立つ'],
  ['天空階段', '一直線3マスが 役立つ'],
  ['黒い要塞', 'ガード不能が ふえる'],
  ['星くず城', '3体の攻撃を よむ'],
  ['王の門', '強いてきが 3体'],
  ['レーンの頂上', 'さいごの しれん'],
] as const

const missions: Mission[] = missionThemes.map(([name, description], index) => {
  const stage = index + 1
  const rewardExp = 80 + stage * 22
  const enemyCount = stage >= 22 ? 3 : stage >= 16 ? 2 : 1
  const actionDelayMs = Math.max(6200, 15000 - index * 310 - (enemyCount - 1) * 900)
  const attackWarning = Math.max(1700, 3400 - index * 55)

  return {
    id: `stage-${stage}`,
    name: `ステージ${stage} ${name}`,
    description,
    strength: '★'.repeat(Math.min(5, Math.ceil(stage / 6))),
    rewardText: `EXP ${rewardExp}`,
    rewardExp,
    enemyHp: 34 + stage * 9 + (enemyCount - 1) * 10,
    enemyCount,
    actionDelayMs,
    warningMs: {
      move: Math.max(1800, attackWarning + 250),
      attack: attackWarning,
    },
  }
})

const initialProfile: ProfileState = {
  level: 1,
  exp: 0,
  expToNext: 100,
  skillPoints: 0,
  learned: ['hit', 'shot'],
  equipped: ['hit', 'shot'],
  missionWins: [],
  missionRecords: {},
  daily: {
    lastLoginDate: '',
    dailyRewardClaimedDate: '',
    goalDate: '',
    goalClears: 0,
    goalRewardClaimedDate: '',
  },
  loginBonus: {
    stampIndex: 0,
    lastClaimedDate: '',
  },
  weeklyStats: {
    weekId: '',
    clears: 0,
    highestStage: 0,
    totalStars: 0,
  },
}

function getJstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getJstWeekId(date = new Date()) {
  const jstDateKey = getJstDateKey(date)
  const jstMidnight = new Date(`${jstDateKey}T00:00:00+09:00`)
  const day = jstMidnight.getUTCDay()
  const daysSinceMonday = (day + 6) % 7
  jstMidnight.setUTCDate(jstMidnight.getUTCDate() - daysSinceMonday)
  return getJstDateKey(jstMidnight)
}

function defaultDailyState(today = getJstDateKey()): DailyState {
  return {
    lastLoginDate: today,
    dailyRewardClaimedDate: '',
    goalDate: today,
    goalClears: 0,
    goalRewardClaimedDate: '',
  }
}

function defaultWeeklyStats(weekId = getJstWeekId()): WeeklyStats {
  return {
    weekId,
    clears: 0,
    highestStage: 0,
    totalStars: 0,
  }
}

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function normalizeProfile(saved: Partial<ProfileState> = {}): ProfileState {
  const today = getJstDateKey()
  const weekId = getJstWeekId()
  const savedDaily = saved.daily ?? initialProfile.daily
  const savedWeekly = saved.weeklyStats ?? initialProfile.weeklyStats
  const missionWins = Array.isArray(saved.missionWins) ? saved.missionWins : initialProfile.missionWins
  const missionRecords: Record<string, MissionRecord> =
    saved.missionRecords && typeof saved.missionRecords === 'object' ? { ...saved.missionRecords } : {}

  missionWins.forEach((missionId) => {
    if (missionRecords[missionId]) return
    missionRecords[missionId] = {
      clears: 1,
      bestStars: 1,
      bestHp: 0,
      bestTimeMs: 0,
      bestMissCommands: 999,
    }
  })

  const daily =
    savedDaily.goalDate === today
      ? { ...defaultDailyState(today), ...savedDaily, lastLoginDate: today }
      : { ...defaultDailyState(today), dailyRewardClaimedDate: savedDaily.dailyRewardClaimedDate ?? '' }
  const weeklyStats = savedWeekly.weekId === weekId ? { ...defaultWeeklyStats(weekId), ...savedWeekly } : defaultWeeklyStats(weekId)

  return {
    ...initialProfile,
    ...saved,
    learned: Array.isArray(saved.learned) ? saved.learned : initialProfile.learned,
    equipped: Array.isArray(saved.equipped) ? saved.equipped : initialProfile.equipped,
    missionWins,
    missionRecords,
    daily,
    loginBonus: { ...initialProfile.loginBonus, ...(saved.loginBonus ?? {}) },
    weeklyStats,
  }
}

function readLocalProfile() {
  return normalizeProfile(readJsonStorage<Partial<ProfileState>>(localProfileKey, {}))
}

function readLocalTechniques() {
  const saved = readJsonStorage<CommandDefinition[]>(localTechniquesKey, [])
  return mergeTechniqueDefinitions(Array.isArray(saved) ? saved : [])
}

function isAdminEmailAllowed(user: AppUser | null) {
  if (!user?.email) return false
  return adminEmails.length === 0 || adminEmails.includes(user.email.toLowerCase())
}

function getFirebaseErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : ''
}

function shouldFallbackToRedirect(error: unknown) {
  const code = getFirebaseErrorCode(error)
  return ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(code)
}

function clampLane(lane: number): Lane {
  return Math.max(0, Math.min(2, lane)) as Lane
}

function lanePercent(lane: Lane) {
  return 16.666 + lane * 33.333
}

function trackPercent(track: Track) {
  if (track === 'far') return 14
  if (track === 'mid') return 34
  if (track === 'near') return 54
  return 86
}

function distanceRank(distance: Distance) {
  if (distance === 'near') return 1
  if (distance === 'mid') return 2
  return 3
}

function trackForRange(range: number): Distance {
  if (range <= 1) return 'near'
  if (range === 2) return 'mid'
  return 'far'
}

function createEnemyState(mission: Mission, index: number): EnemyState {
  const lanes: Lane[] = mission.enemyCount >= 3 ? [0, 1, 2] : mission.enemyCount === 2 ? [0, 2] : [1]
  const distances: Distance[] = mission.enemyCount >= 3 ? ['far', 'mid', 'near'] : mission.enemyCount === 2 ? ['far', 'mid'] : ['mid']
  const hpScale = mission.enemyCount === 1 ? 1 : 0.74 + index * 0.1

  return {
    id: `enemy-${index + 1}`,
    hp: Math.round(mission.enemyHp * hpScale),
    maxHp: Math.round(mission.enemyHp * hpScale),
    lane: lanes[index] ?? 1,
    distance: distances[index] ?? 'mid',
    warning: undefined,
    turn: index,
    nextDelayMs: mission.actionDelayMs + index * 2200,
    flashMs: 0,
  }
}

function createBattleState(mission: Mission, profile: ProfileState): BattleState {
  const baseState: BattleState = {
    mission,
    status: 'playing',
    playerHp: 100,
    maxPlayerHp: 100,
    playerLane: 1,
    guardMs: 0,
    enemies: Array.from({ length: mission.enemyCount }, (_, index) => createEnemyState(mission, index)),
    effects: [],
    nextEventMs: 0,
    turn: 0,
    rewardApplied: false,
    playerFlashMs: 0,
    elapsedMs: 0,
    typedCommands: 0,
    missCommands: 0,
    clearTimeMs: 0,
  }

  return {
    ...baseState,
    enemies: baseState.enemies.map((enemy) => scheduleEnemyWarning(enemy, baseState, profile, enemy.nextDelayMs)),
  }
}

function addProfileExp(profile: ProfileState, expGain: number): ProfileState {
  let exp = profile.exp + expGain
  let level = profile.level
  let expToNext = profile.expToNext
  let skillPoints = profile.skillPoints

  while (exp >= expToNext) {
    exp -= expToNext
    level += 1
    skillPoints += 1
    expToNext = Math.round(expToNext * 1.45)
  }

  return {
    ...profile,
    level,
    exp,
    expToNext,
    skillPoints,
  }
}

function getMissionStage(mission: Mission) {
  const match = mission.id.match(/\d+$/)
  return match ? Number(match[0]) : 1
}

function calculateMissionStars(battle: BattleState) {
  if (battle.status !== 'cleared') return 0
  let stars = 1
  if (battle.playerHp / battle.maxPlayerHp >= 0.5) stars += 1
  if (battle.missCommands <= 3) stars += 1
  return stars
}

function createMissionRewardSummary(profile: ProfileState, battle: BattleState): MissionRewardSummary {
  const previousRecord = profile.missionRecords[battle.mission.id]
  const previousBestStars = previousRecord?.bestStars ?? 0
  const stars = calculateMissionStars(battle)
  const firstClear = !previousRecord || previousRecord.clears <= 0
  const baseExp = firstClear ? battle.mission.rewardExp : Math.max(1, Math.round(battle.mission.rewardExp * 0.3))
  const addedStars = Math.max(0, stars - previousBestStars)
  const starBonusExp = addedStars * Math.max(20, Math.round(battle.mission.rewardExp * 0.15))

  return {
    stars,
    previousBestStars,
    bestUpdated: stars > previousBestStars,
    firstClear,
    baseExp,
    starBonusExp,
    totalExp: baseExp + starBonusExp,
    clearTimeMs: battle.clearTimeMs || battle.elapsedMs,
    remainingHp: battle.playerHp,
    typedCommands: battle.typedCommands,
    missCommands: battle.missCommands,
  }
}

function applyMissionReward(profile: ProfileState, battle: BattleState): ProfileState {
  const summary = createMissionRewardSummary(profile, battle)
  const previousRecord = profile.missionRecords[battle.mission.id]
  const nextRecord: MissionRecord = {
    clears: (previousRecord?.clears ?? 0) + 1,
    bestStars: Math.max(previousRecord?.bestStars ?? 0, summary.stars),
    bestHp: Math.max(previousRecord?.bestHp ?? 0, summary.remainingHp),
    bestTimeMs: previousRecord?.bestTimeMs ? Math.min(previousRecord.bestTimeMs, summary.clearTimeMs) : summary.clearTimeMs,
    bestMissCommands: previousRecord?.bestMissCommands !== undefined ? Math.min(previousRecord.bestMissCommands, summary.missCommands) : summary.missCommands,
  }
  const today = getJstDateKey()
  const weekId = getJstWeekId()
  const currentDaily = profile.daily.goalDate === today ? profile.daily : defaultDailyState(today)
  const currentWeekly = profile.weeklyStats.weekId === weekId ? profile.weeklyStats : defaultWeeklyStats(weekId)
  const stage = getMissionStage(battle.mission)
  const withExp = addProfileExp(profile, summary.totalExp)

  return {
    ...withExp,
    missionWins: profile.missionWins.includes(battle.mission.id) ? profile.missionWins : [...profile.missionWins, battle.mission.id],
    missionRecords: {
      ...profile.missionRecords,
      [battle.mission.id]: nextRecord,
    },
    daily: {
      ...currentDaily,
      lastLoginDate: today,
      goalClears: Math.max(currentDaily.goalClears, 1),
    },
    weeklyStats: {
      weekId,
      clears: currentWeekly.clears + 1,
      highestStage: Math.max(currentWeekly.highestStage, stage),
      totalStars: currentWeekly.totalStars + summary.stars,
    },
  }
}

function buildEnemyWarning(enemy: EnemyState, state: BattleState, profile: ProfileState, turn: number, duration: number, phase: 'preview' | 'active' = 'preview'): Warning {
  const id = Date.now() + turn
  const sameLane = enemy.lane === state.playerLane
  const moveCycle: Distance[] = ['far', 'mid', 'near', 'mid']
  const nextMoveDistance = moveCycle[Math.floor((turn + Number(enemy.id.replace('enemy-', ''))) / 2) % moveCycle.length]

  if (profile.learned.includes('fire') && turn % 9 === 0 && enemy.distance === 'far') {
    return {
      id,
      enemyId: enemy.id,
      type: 'weak',
      phase,
      icon: 'fire',
      label: '🔥',
      lane: enemy.lane,
      duration,
      timeLeft: duration,
      damage: 0,
      guardable: false,
      weakness: 'fire',
    }
  }

  if (!sameLane && turn % 2 === 0) {
    return {
      id,
      enemyId: enemy.id,
      type: 'move-lane',
      phase,
      icon: 'move',
      label: '↔️',
      lane: state.playerLane,
      duration,
      timeLeft: duration,
      damage: 0,
      guardable: false,
      nextLane: state.playerLane,
    }
  }

  if (turn % 2 === 1) {
    const movingCloser = distanceRank(nextMoveDistance) < distanceRank(enemy.distance)
    return {
      id,
      enemyId: enemy.id,
      type: movingCloser ? 'move-near' : 'move-far',
      phase,
      icon: movingCloser ? 'down' : 'up',
      label: movingCloser ? '⬇️' : '⬆️',
      lane: enemy.lane,
      duration,
      timeLeft: duration,
      damage: 0,
      guardable: false,
      nextDistance: nextMoveDistance,
    }
  }

  if (enemy.distance !== 'near') {
    return {
      id,
      enemyId: enemy.id,
      type: 'ranged',
      phase,
      icon: 'shot',
      label: '🏹',
      lane: enemy.lane,
      duration,
      timeLeft: duration,
      damage: 10,
      guardable: true,
    }
  }

  return {
    id,
    enemyId: enemy.id,
    type: turn % 6 === 0 ? 'unblockable' : 'melee',
    phase,
    icon: turn % 6 === 0 ? 'danger' : 'slash',
    label: turn % 6 === 0 ? '❗' : '⚔️',
    lane: enemy.lane,
    duration,
    timeLeft: duration,
    damage: turn % 6 === 0 ? 16 : 12,
    guardable: turn % 6 !== 0,
  }
}

function scheduleEnemyWarning(enemy: EnemyState, state: BattleState, profile: ProfileState, duration = state.mission.actionDelayMs): EnemyState {
  if (state.status !== 'playing' || enemy.hp <= 0) return { ...enemy, warning: undefined }

  const turn = enemy.turn + 1
  return {
    ...enemy,
    turn,
    nextDelayMs: duration,
    warning: buildEnemyWarning(enemy, state, profile, turn, duration),
  }
}

function createEnemyEffect(enemy: EnemyState, warning: Warning): BattleEffect | null {
  if (warning.type === 'move-lane' || warning.type === 'move-near' || warning.type === 'move-far' || warning.type === 'weak') {
    return null
  }

  const id = Date.now() + Math.random()
  if (warning.type === 'ranged') {
    return {
      id,
      owner: 'enemy',
      type: 'enemy-bolt',
      icon: 'bolt',
      lane: warning.lane,
      fromTrack: enemy.distance,
      toTrack: 'player',
      duration: 1000,
      elapsed: 0,
      damage: warning.damage,
      guardable: true,
      command: 'enemy-ranged',
    }
  }

  return {
    id,
    owner: 'enemy',
    type: 'enemy-dash',
    icon: warning.type === 'unblockable' ? 'danger' : 'slash',
    lane: warning.lane,
    fromTrack: enemy.distance,
    toTrack: 'player',
    duration: 760,
    elapsed: 0,
    damage: warning.damage,
    guardable: warning.guardable,
    command: 'enemy-melee',
  }
}

function getPowerText(definition?: CommandDefinition) {
  return definition?.power ? `威力 ${definition.power}` : ''
}

function getRangeText(definition?: CommandDefinition) {
  if (!definition?.rangeMode || !definition.range) return ''
  if (definition.rangeMode === 'front') return '射程 目の前1マス'
  if (definition.rangeMode === 'exact') return `射程 ${definition.range}マス先だけ`
  return `射程 一直線に${definition.range}マス`
}

function getUnlockText(skill: CommandDefinition, profile: ProfileState) {
  if (profile.learned.includes(skill.command)) return 'おぼえた'
  if (skill.prereq && !profile.learned.includes(skill.prereq)) return `${skill.prereq} がひつよう`
  if ((skill.requiredLevel ?? 1) > profile.level) return `Lv.${skill.requiredLevel} で解放`
  if (profile.skillPoints < (skill.cost ?? 1)) return `SPが ${skill.cost ?? 1} ひつよう`
  return `${skill.cost ?? 1} SPでおぼえる`
}

function getNextMission(currentMission: Mission) {
  const index = missions.findIndex((mission) => mission.id === currentMission.id)
  return index >= 0 ? missions[index + 1] : undefined
}

function effectStyleIcon(effectStyle?: EffectStyle): IconKind {
  switch (effectStyle) {
    case 'arrow':
      return 'shot'
    case 'fire':
      return 'fire'
    case 'bolt':
      return 'bolt'
    case 'ice':
      return 'ice'
    case 'wind':
      return 'wind'
    case 'stone':
      return 'stone'
    case 'light':
      return 'light'
    case 'dark':
      return 'dark'
    case 'water':
      return 'water'
    default:
      return 'slash'
  }
}

function effectTypeForStyle(effectStyle?: EffectStyle): EffectType {
  if (effectStyle === 'slash' || effectStyle === 'wind' || effectStyle === 'stone') return 'player-hit'
  if (effectStyle === 'fire') return 'player-fire'
  return 'player-shot'
}

function commandRecord(definitions: CommandDefinition[]) {
  return Object.fromEntries(definitions.map((definition) => [definition.command, definition])) as Record<string, CommandDefinition>
}

let audioContext: AudioContext | null = null
let audioMaster: GainNode | null = null
let bgmTimer: number | undefined
let bgmStep = 0
let activeBgmMode: BgmMode | null = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const AudioContextClass = window.AudioContext ?? (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    audioContext = new AudioContextClass()
    audioMaster = audioContext.createGain()
    audioMaster.gain.value = 0.46
    audioMaster.connect(audioContext.destination)
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume()
  }
  return audioContext
}

function playTone(frequency: number, duration: number, type: OscillatorType, gainValue: number, delay = 0, endFrequency?: number) {
  const context = getAudioContext()
  if (!context || !audioMaster) return
  const start = context.currentTime + delay
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration)
  }
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain)
  gain.connect(audioMaster)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.03)
}

function playNoise(duration: number, gainValue: number, delay = 0, frequency = 900, filterType: BiquadFilterType = 'bandpass') {
  const context = getAudioContext()
  if (!context || !audioMaster) return
  const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < sampleCount; index += 1) {
    data[index] = Math.random() * 2 - 1
  }

  const start = context.currentTime + delay
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  source.buffer = buffer
  filter.type = filterType
  filter.frequency.setValueAtTime(frequency, start)
  filter.Q.value = 0.9
  gain.gain.setValueAtTime(gainValue, start)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(audioMaster)
  source.start(start)
  source.stop(start + duration)
}

function playGameSound(name: SoundName, enabled: boolean) {
  if (!enabled) return
  switch (name) {
    case 'ui':
      playTone(560, 0.1, 'triangle', 0.11, 0, 760)
      break
    case 'start':
      playTone(392, 0.12, 'triangle', 0.12)
      playTone(587, 0.16, 'triangle', 0.12, 0.08)
      playTone(784, 0.18, 'triangle', 0.1, 0.18)
      break
    case 'move':
      playTone(460, 0.08, 'sine', 0.1)
      playTone(640, 0.09, 'sine', 0.075, 0.045)
      break
    case 'guard':
      playTone(190, 0.22, 'triangle', 0.14)
      playTone(320, 0.22, 'sine', 0.08, 0.04)
      playNoise(0.12, 0.08, 0.02, 420, 'lowpass')
      break
    case 'attack':
      playTone(620, 0.08, 'square', 0.08, 0, 900)
      break
    case 'miss':
      playTone(170, 0.18, 'sawtooth', 0.08, 0, 110)
      break
    case 'clear':
      playTone(523, 0.14, 'triangle', 0.13)
      playTone(659, 0.14, 'triangle', 0.13, 0.11)
      playTone(784, 0.2, 'triangle', 0.14, 0.22)
      playTone(1046, 0.24, 'sine', 0.1, 0.38)
      break
    case 'defeat':
      playTone(260, 0.22, 'triangle', 0.1)
      playTone(196, 0.32, 'sine', 0.09, 0.16)
      playNoise(0.28, 0.08, 0.02, 180, 'lowpass')
      break
  }
}

function playTechniqueSound(technique: CommandDefinition | undefined, enabled: boolean) {
  if (!enabled) return
  const style = technique?.effectStyle ?? 'slash'
  const powerScale = Math.min(0.1, Math.max(0, ((technique?.power ?? 12) - 12) / 800))
  switch (style) {
    case 'slash':
      playNoise(0.13, 0.18 + powerScale, 0, 1500, 'bandpass')
      playTone(340, 0.1, 'square', 0.12, 0, 760)
      playTone(115, 0.09, 'sine', 0.1, 0.08)
      break
    case 'arrow':
      playTone(760, 0.16, 'triangle', 0.12, 0, 1220)
      playNoise(0.08, 0.1, 0.02, 2600, 'highpass')
      playTone(140, 0.08, 'sine', 0.08, 0.12)
      break
    case 'fire':
      playNoise(0.24, 0.16 + powerScale, 0, 620, 'lowpass')
      playTone(180, 0.18, 'sawtooth', 0.1, 0, 120)
      playTone(520, 0.16, 'triangle', 0.1, 0.05, 760)
      break
    case 'bolt':
      playTone(1160, 0.06, 'square', 0.14)
      playTone(620, 0.06, 'square', 0.12, 0.055)
      playTone(1440, 0.08, 'square', 0.12, 0.11)
      playNoise(0.12, 0.12 + powerScale, 0.02, 1800, 'bandpass')
      break
    case 'ice':
      playTone(880, 0.18, 'sine', 0.1)
      playTone(1320, 0.22, 'triangle', 0.085, 0.06)
      playNoise(0.16, 0.07, 0.03, 3200, 'highpass')
      break
    case 'wind':
      playNoise(0.24, 0.14 + powerScale, 0, 1100, 'bandpass')
      playTone(420, 0.16, 'sine', 0.07, 0, 720)
      break
    case 'stone':
      playTone(95, 0.18, 'sine', 0.16)
      playNoise(0.18, 0.13 + powerScale, 0.04, 260, 'lowpass')
      break
    case 'light':
      playTone(660, 0.16, 'triangle', 0.1)
      playTone(990, 0.2, 'sine', 0.1, 0.05)
      playTone(1320, 0.18, 'triangle', 0.08, 0.12)
      break
    case 'dark':
      playTone(145, 0.28, 'sawtooth', 0.12, 0, 90)
      playNoise(0.24, 0.09 + powerScale, 0.02, 360, 'lowpass')
      break
    case 'water':
      playTone(420, 0.16, 'sine', 0.08, 0, 340)
      playTone(620, 0.12, 'triangle', 0.075, 0.08, 500)
      playNoise(0.16, 0.08, 0.02, 900, 'bandpass')
      break
  }
}

function playBattleEffectSound(effect: BattleEffect, commandMeta: Record<string, CommandDefinition>, enabled: boolean) {
  if (!enabled) return
  const impactDelay = Math.max(0.08, effect.duration / 1000)
  if (effect.owner === 'player') {
    playTechniqueSound(commandMeta[effect.command], enabled)
    playTone(120, 0.08, 'sine', 0.1, impactDelay)
    playNoise(0.08, 0.09, impactDelay, 520, 'bandpass')
    return
  }
  if (effect.type === 'enemy-dash') {
    playNoise(0.18, 0.16, 0, 520, 'bandpass')
    playTone(125, 0.16, 'sawtooth', 0.12, 0, 90)
    playTone(95, 0.1, 'sine', 0.12, impactDelay)
    return
  }
  playTone(260, 0.12, 'square', 0.12, 0, 180)
  playNoise(0.16, 0.12, 0.04, 900, 'bandpass')
  playTone(110, 0.1, 'sine', 0.1, impactDelay)
}

function getBgmPattern(mode: BgmMode) {
  switch (mode) {
    case 'home':
      return {
        notes: [523, 659, 784, 659, 587, 659, 784, 988],
        bass: [262, 330, 392, 330],
        interval: 620,
        type: 'triangle' as OscillatorType,
        gain: 0.035,
        bassGain: 0.018,
      }
    case 'missions':
      return {
        notes: [392, 494, 587, 659, 587, 494, 440, 494],
        bass: [196, 247, 294, 247],
        interval: 500,
        type: 'square' as OscillatorType,
        gain: 0.03,
        bassGain: 0.02,
      }
    case 'growth':
      return {
        notes: [330, 392, 494, 440, 392, 330, 294, 330],
        bass: [165, 196, 247, 196],
        interval: 760,
        type: 'sine' as OscillatorType,
        gain: 0.032,
        bassGain: 0.017,
      }
    case 'loading':
      return {
        notes: [440, 494, 523, 587, 659, 587, 523, 494],
        bass: [220, 247, 262, 247],
        interval: 420,
        type: 'triangle' as OscillatorType,
        gain: 0.035,
        bassGain: 0.021,
      }
    case 'battle':
      return {
        notes: [330, 392, 466, 392, 349, 415, 523, 415],
        bass: [110, 147, 131, 147],
        interval: 360,
        type: 'sawtooth' as OscillatorType,
        gain: 0.026,
        bassGain: 0.026,
      }
    case 'admin':
      return {
        notes: [294, 349, 392, 349, 330, 349, 392, 440],
        bass: [147, 175, 196, 175],
        interval: 820,
        type: 'sine' as OscillatorType,
        gain: 0.022,
        bassGain: 0.012,
      }
  }
}

function setBgmActive(mode: BgmMode | null, enabled: boolean) {
  if (typeof window === 'undefined') return
  if (bgmTimer !== undefined) {
    window.clearInterval(bgmTimer)
    bgmTimer = undefined
  }
  activeBgmMode = null
  if (!mode || !enabled) return

  const pattern = getBgmPattern(mode)
  activeBgmMode = mode
  bgmStep = 0
  const playBgmStep = () => {
    if (activeBgmMode !== mode) return
    const note = pattern.notes[bgmStep % pattern.notes.length]
    const bass = pattern.bass[Math.floor(bgmStep / 2) % pattern.bass.length]
    playTone(note, Math.min(0.28, pattern.interval / 1000 - 0.04), pattern.type, pattern.gain)
    if (bgmStep % 2 === 0) playTone(bass, Math.min(0.36, pattern.interval / 1000), 'triangle', pattern.bassGain)
    if (mode === 'battle' && bgmStep % 4 === 2) playNoise(0.08, 0.018, 0.01, 520, 'bandpass')
    if (mode === 'missions' && bgmStep % 4 === 0) playTone(note * 2, 0.08, 'triangle', 0.018, 0.05)
    bgmStep += 1
  }
  playBgmStep()
  bgmTimer = window.setInterval(playBgmStep, pattern.interval)
}

function createPlayerEffect(state: BattleState, command: string, commandMeta: Record<string, CommandDefinition>): BattleEffect | null {
  const id = Date.now() + Math.random()
  const lane = state.playerLane
  const definition = commandMeta[command]
  if (!definition?.power || !definition.rangeMode || !definition.range) return null
  const range = definition.range

  const targetEnemy = state.enemies.find(
    (enemy) =>
      enemy.hp > 0 &&
      state.playerLane === enemy.lane &&
      ((definition.rangeMode === 'line' && distanceRank(enemy.distance) <= range) ||
        (definition.rangeMode === 'exact' && distanceRank(enemy.distance) === range) ||
        (definition.rangeMode === 'front' && distanceRank(enemy.distance) === 1)),
  )
  const targetTrack = targetEnemy?.distance ?? trackForRange(range)

  return {
    id,
    owner: 'player',
    type: effectTypeForStyle(definition.effectStyle),
    icon: effectStyleIcon(definition.effectStyle),
    lane,
    fromTrack: 'player',
    toTrack: targetTrack,
    duration: definition.effectStyle === 'slash' ? 560 : 920,
    elapsed: 0,
    damage: definition.power,
    guardable: false,
    weakness: definition.effectStyle === 'fire' ? 'fire' : undefined,
    command,
    rangeMode: definition.rangeMode,
    range,
    targetEnemyId: targetEnemy?.id,
  }
}

function resolveEffectImpact(state: BattleState, effect: BattleEffect): BattleState {
  if (effect.owner === 'enemy') {
    if (effect.lane !== state.playerLane) {
      return state
    }

    const guarded = state.guardMs > 0 && effect.guardable
    const damage = guarded ? 0 : effect.damage
    const playerHp = Math.max(0, state.playerHp - damage)

    return {
      ...state,
      status: playerHp <= 0 ? 'defeated' : state.status,
      playerHp,
      playerFlashMs: damage > 0 ? 260 : state.playerFlashMs,
    }
  }

  const targetIndex = state.enemies.findIndex((enemy) => enemy.hp > 0 && (effect.targetEnemyId ? enemy.id === effect.targetEnemyId : enemy.lane === effect.lane && enemy.distance === effect.toTrack))
  if (targetIndex < 0) {
    return state
  }

  const targetEnemy = state.enemies[targetIndex]
  const weaknessBonus = targetEnemy.warning?.type === 'weak' && targetEnemy.warning.phase === 'active' && effect.weakness === 'fire' ? 16 : 0
  const enemyHp = Math.max(0, targetEnemy.hp - effect.damage - weaknessBonus)
  const enemies = state.enemies.map((enemy, index) =>
    index === targetIndex
      ? {
          ...enemy,
          hp: enemyHp,
          flashMs: 260,
          warning: enemyHp <= 0 || (enemy.warning?.type === 'weak' && enemy.warning.phase === 'active' && effect.weakness === 'fire') ? undefined : enemy.warning,
        }
      : enemy,
  )
  const allDefeated = enemies.every((enemy) => enemy.hp <= 0)

  return {
    ...state,
    status: allDefeated ? 'cleared' : state.status,
    clearTimeMs: allDefeated && !state.clearTimeMs ? state.elapsedMs : state.clearTimeMs,
    enemies,
    nextEventMs: allDefeated ? 0 : state.nextEventMs,
  }
}

function tickBattle(state: BattleState, profile: ProfileState, dt: number): BattleState {
  if (state.status !== 'playing') return state

  let nextState: BattleState = {
    ...state,
    guardMs: Math.max(0, state.guardMs - dt),
    playerFlashMs: Math.max(0, state.playerFlashMs - dt),
    elapsedMs: state.elapsedMs + dt,
    enemies: state.enemies.map((enemy) => ({ ...enemy, flashMs: Math.max(0, enemy.flashMs - dt) })),
  }

  if (nextState.effects.length > 0) {
    const pending: BattleEffect[] = []
    for (const effect of nextState.effects) {
      const elapsed = effect.elapsed + dt
      if (elapsed >= effect.duration) {
        nextState = resolveEffectImpact(nextState, effect)
      } else {
        pending.push({ ...effect, elapsed })
      }
    }
    nextState = { ...nextState, effects: pending }
  }

  const updatedEnemies = nextState.enemies.map((enemy) => {
    if (enemy.hp <= 0 || !enemy.warning) return enemy

    const timeLeft = enemy.warning.timeLeft - dt
    if (timeLeft > 0) {
      return {
        ...enemy,
        warning: {
          ...enemy.warning,
          timeLeft,
        },
      }
    }

    const warning = enemy.warning
    if (warning.type === 'weak' && warning.phase === 'preview') {
      return {
          ...enemy,
          warning: {
            ...warning,
            phase: 'active' as const,
            duration: nextState.mission.warningMs.attack,
            timeLeft: nextState.mission.warningMs.attack,
          },
      }
    }

    if (warning.type === 'weak') {
      return scheduleEnemyWarning({ ...enemy, warning: undefined }, nextState, profile)
    }

    if (warning.type === 'move-lane') {
      return scheduleEnemyWarning(
        {
          ...enemy,
          lane: warning.nextLane ?? enemy.lane,
          warning: undefined,
        },
        nextState,
        profile,
        nextState.mission.warningMs.move,
      )
    }

    if (warning.type === 'move-near' || warning.type === 'move-far') {
      return scheduleEnemyWarning(
        {
          ...enemy,
          distance: warning.nextDistance ?? enemy.distance,
          warning: undefined,
        },
        nextState,
        profile,
        nextState.mission.warningMs.move,
      )
    }

    const effect = createEnemyEffect(enemy, warning)
    if (effect) {
      nextState = { ...nextState, effects: [...nextState.effects, effect] }
    }
    return scheduleEnemyWarning({ ...enemy, warning: undefined }, nextState, profile, nextState.mission.actionDelayMs)
  })

  nextState = { ...nextState, enemies: updatedEnemies }

  return nextState
}

function runBattleCommand(state: BattleState, command: string, availableCommands: string[], commandMeta: Record<string, CommandDefinition>): BattleState {
  if (state.status !== 'playing') return state
  const normalized = command.trim().toLowerCase()
  if (!normalized) return { ...state, missCommands: state.missCommands + 1 }
  const countedState = { ...state, typedCommands: state.typedCommands + 1 }
  if (!availableCommands.includes(normalized)) {
    return { ...countedState, missCommands: countedState.missCommands + 1 }
  }

  if (normalized === 'left' || normalized === 'right') {
    const delta = normalized === 'left' ? -1 : 1
    return {
      ...countedState,
      playerLane: clampLane(countedState.playerLane + delta),
    }
  }

  if (normalized === 'guard') {
    return {
      ...countedState,
      guardMs: 1700,
    }
  }

  const effect = createPlayerEffect(countedState, normalized, commandMeta)
  if (!effect) return { ...countedState, missCommands: countedState.missCommands + 1 }

  return {
    ...countedState,
    effects: [...countedState.effects, effect],
  }
}

function battleReducer(state: BattleState, action: BattleAction, profile: ProfileState): BattleState {
  switch (action.type) {
    case 'tick':
      return tickBattle(state, profile, action.dt)
    case 'command':
      return runBattleCommand(state, action.command, action.availableCommands, action.commandMeta)
    case 'mark-reward-applied':
      return { ...state, rewardApplied: true, rewardSummary: action.rewardSummary }
    default:
      return state
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>(() => (window.location.hash === '#admin' || window.location.pathname.endsWith('/admin') ? 'techEditor' : 'home'))
  const [profile, setProfile] = useState<ProfileState>(() => readLocalProfile())
  const [techniques, setTechniques] = useState<CommandDefinition[]>(() => readLocalTechniques())
  const [editingCommand, setEditingCommand] = useState(defaultTechniqueDefinitions[0].command)
  const [selectedSkillTree, setSelectedSkillTree] = useState<SkillTreeId>('melee')
  const [growthTab, setGrowthTab] = useState<GrowthTab>('equip')
  const [learnedFilter, setLearnedFilter] = useState<LearnedCommandFilter>('all')
  const [soundEnabled, setSoundEnabled] = useState(() => readJsonStorage<boolean>(localSoundKey, true))
  const [battle, setBattle] = useState<BattleState | null>(null)
  const [loadingMission, setLoadingMission] = useState<Mission | null>(null)
  const [countdown, setCountdown] = useState(3)
  const [commandText, setCommandText] = useState('')
  const [authUser, setAuthUser] = useState<AppUser | null>(null)
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured)
  const [authStarting, setAuthStarting] = useState(false)
  const [adminReady, setAdminReady] = useState(!isFirebaseConfigured)
  const [isAdminAccount, setIsAdminAccount] = useState(false)
  const [cloudProfileReady, setCloudProfileReady] = useState(!isFirebaseConfigured)
  const [cloudProfileOwner, setCloudProfileOwner] = useState<string | null>(null)
  const [cloudStatus, setCloudStatus] = useState(isFirebaseConfigured ? 'ログインすると進捗を保存できます' : 'Firebase未設定: この端末に保存中')
  const [techniqueSaveStatus, setTechniqueSaveStatus] = useState('')
  const commandInputRef = useRef<HTMLInputElement>(null)
  const lastBattleStatusRef = useRef<Status | null>(null)
  const playedEffectIdsRef = useRef<Set<number>>(new Set())

  const commandMeta = useMemo(() => commandRecord([...fixedCommandDefinitions, ...techniques]), [techniques])
  const editingTechnique = techniques.find((technique) => technique.command === editingCommand) ?? techniques[0]
  const availableCommands = useMemo(() => [...fixedCommands, ...profile.equipped], [profile.equipped])
  const learnedTechniqueCommands = useMemo(
    () => [...new Set(['hit', 'shot', ...profile.learned.filter((command) => !fixedCommands.includes(command))])].filter((command) => commandMeta[command]),
    [commandMeta, profile.learned],
  )
  const learnedFilterOptions = useMemo(
    () => [
      { id: 'all' as const, label: 'すべて', icon: '✨' },
      { id: 'equipped' as const, label: 'そうび中', icon: '🎒' },
      ...skillTreeOrder.map((tree) => ({ id: tree, label: skillTreeInfo[tree].title, icon: skillTreeInfo[tree].icon })),
    ],
    [],
  )
  const filteredLearnedTechniqueCommands = useMemo(
    () =>
      learnedTechniqueCommands.filter((command) => {
        if (learnedFilter === 'all') return true
        if (learnedFilter === 'equipped') return profile.equipped.includes(command)
        return (commandMeta[command]?.tree ?? 'range') === learnedFilter
      }),
    [commandMeta, learnedFilter, learnedTechniqueCommands, profile.equipped],
  )
  const unlockableTechniques = useMemo(() => techniques.filter((technique) => !['hit', 'shot'].includes(technique.command)), [techniques])
  const skillTreeGroups = useMemo(
    () =>
      skillTreeOrder.map((tree) => ({
        tree,
        ...skillTreeInfo[tree],
        skills: [...unlockableTechniques.filter((skill) => (skill.tree ?? 'range') === tree)].sort(
          (a, b) => (a.tier ?? 1) - (b.tier ?? 1) || (a.requiredLevel ?? 1) - (b.requiredLevel ?? 1) || a.command.localeCompare(b.command),
        ),
      })),
    [unlockableTechniques],
  )
  const selectedSkillTreeGroup = skillTreeGroups.find((group) => group.tree === selectedSkillTree) ?? skillTreeGroups[0]
  const selectedSkillTiers = useMemo(() => {
    if (!selectedSkillTreeGroup) return []
    const tiers = new Map<number, CommandDefinition[]>()
    selectedSkillTreeGroup.skills.forEach((skill) => {
      const tier = skill.tier ?? 1
      tiers.set(tier, [...(tiers.get(tier) ?? []), skill])
    })
    return [...tiers.entries()]
      .sort(([a], [b]) => a - b)
      .map(([tier, skills]) => ({ tier, skills }))
  }, [selectedSkillTreeGroup])
  const adminMode = screen === 'techEditor'
  const adminEmailAllowed = isAdminEmailAllowed(authUser)
  const canEditTechniques = adminMode && isAdminAccount

  useEffect(() => {
    if (!isFirebaseConfigured) return

    let unsubscribe: (() => void) | undefined
    let active = true

    async function setupAuth() {
      try {
        const [{ getFirebaseServices }, { browserLocalPersistence, getRedirectResult, onAuthStateChanged, setPersistence }] = await Promise.all([import('./firebaseClient'), import('firebase/auth')])
        if (!active) return

        const services = getFirebaseServices()
        if (!services) {
          setAuthReady(true)
          return
        }

        unsubscribe = onAuthStateChanged(services.auth, (user) => {
          setAuthUser(user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null)
          setAuthReady(true)
          if (!user) {
            setIsAdminAccount(false)
            setCloudProfileReady(true)
            setCloudProfileOwner(null)
            setCloudStatus('ログインすると進捗を保存できます')
          }
        })

        await setPersistence(services.auth, browserLocalPersistence)
        const result = await getRedirectResult(services.auth)
        if (result?.user) {
          setCloudStatus('ログインしました')
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '不明なエラー'
        setCloudStatus(`ログイン準備に失敗しました: ${message}`)
      } finally {
        setAuthReady(true)
      }
    }

    void setupAuth()

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    function handleAdminRoute() {
      if (window.location.hash === '#admin' || window.location.pathname.endsWith('/admin')) {
        setScreen('techEditor')
      }
    }

    window.addEventListener('hashchange', handleAdminRoute)
    return () => window.removeEventListener('hashchange', handleAdminRoute)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(localProfileKey, JSON.stringify(profile))
  }, [profile])

  useEffect(() => {
    window.localStorage.setItem(localTechniquesKey, JSON.stringify(techniques))
  }, [techniques])

  useEffect(() => {
    window.localStorage.setItem(localSoundKey, JSON.stringify(soundEnabled))
    if (!soundEnabled) setBgmActive(null, false)
  }, [soundEnabled])

  useEffect(() => {
    setBgmActive(getBgmMode(screen), soundEnabled)
    return () => setBgmActive(null, false)
  }, [screen, soundEnabled])

  useEffect(() => {
    if (!isFirebaseConfigured) return

    let active = true

    async function loadTechniques() {
      try {
        const [{ getFirebaseServices }, { collection, getDocs, orderBy, query }] = await Promise.all([import('./firebaseClient'), import('firebase/firestore')])
        if (!active) return
        const services = getFirebaseServices()
        if (!services) return

        const techniquesQuery = query(collection(services.db, 'techniques'), orderBy('command'))
        const snapshot = await getDocs(techniquesQuery)
        if (!active) return

        const loaded = snapshot.docs
          .map((item) => normalizeTechnique(item.data() as CommandDefinition))
          .filter((technique) => technique?.command)
        if (loaded.length > 0) {
          const merged = mergeTechniqueDefinitions(loaded)
          setTechniques(merged)
          setEditingCommand(merged[0].command)
        }
      } catch {
        if (!active) return
        setTechniqueSaveStatus('技データを読み込めませんでした')
      }
    }

    void loadTechniques()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!authReady || !authUser || !isFirebaseConfigured) return

    let active = true
    const userId = authUser.uid

    async function loadProfile() {
      setCloudProfileReady(false)
      setCloudProfileOwner(null)
      try {
        const [{ getFirebaseServices }, { doc, getDoc }] = await Promise.all([import('./firebaseClient'), import('firebase/firestore')])
        if (!active) return
        const services = getFirebaseServices()
        if (!services) return

        const snapshot = await getDoc(doc(services.db, 'users', userId))
        if (!active) return

        const data = snapshot.data()
        if (data?.profile) {
          setProfile(normalizeProfile(data.profile as Partial<ProfileState>))
          setCloudStatus('クラウド進捗を読み込みました')
        } else {
          setCloudStatus('この端末の進捗をクラウドへ保存します')
        }
      } catch {
        if (!active) return
        setCloudStatus('進捗を読み込めませんでした')
      }
      setCloudProfileOwner(userId)
      setCloudProfileReady(true)
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [authReady, authUser])

  useEffect(() => {
    if (!authReady || !authUser || !cloudProfileReady || cloudProfileOwner !== authUser.uid || !isFirebaseConfigured) return

    const handle = window.setTimeout(async () => {
      try {
        const [{ getFirebaseServices }, { doc, serverTimestamp, setDoc }] = await Promise.all([import('./firebaseClient'), import('firebase/firestore')])
        const services = getFirebaseServices()
        if (!services) return

        await setDoc(
          doc(services.db, 'users', authUser.uid),
          {
            profile,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
        setCloudStatus('進捗をクラウド保存しました')
      } catch {
        setCloudStatus('進捗を保存できていません')
      }
    }, 700)

    return () => window.clearTimeout(handle)
  }, [authReady, authUser, cloudProfileOwner, cloudProfileReady, profile])

  useEffect(() => {
    if (!isFirebaseConfigured) return

    let active = true

    async function loadAdminStatus() {
      if (!authReady || !authUser) {
        if (active) {
          setIsAdminAccount(false)
          setAdminReady(authReady)
        }
        return
      }
      if (!isAdminEmailAllowed(authUser)) {
        if (active) {
          setIsAdminAccount(false)
          setAdminReady(true)
        }
        return
      }

      setAdminReady(false)
      try {
        const [{ getFirebaseServices }, { doc, getDoc }] = await Promise.all([import('./firebaseClient'), import('firebase/firestore')])
        if (!active) return
        const services = getFirebaseServices()
        if (!services) return

        const snapshot = await getDoc(doc(services.db, 'admins', authUser.uid))
        if (!active) return
        setIsAdminAccount(snapshot.exists())
      } catch {
        if (!active) return
        setIsAdminAccount(false)
      } finally {
        if (active) setAdminReady(true)
      }
    }

    void loadAdminStatus()

    return () => {
      active = false
    }
  }, [authReady, authUser])

  useEffect(() => {
    if (screen !== 'battle') return
    const tickMs = 100
    const timer = window.setInterval(() => {
      setBattle((current) => {
        if (!current) return current
        return battleReducer(current, { type: 'tick', dt: tickMs }, profile)
      })
    }, tickMs)

    return () => window.clearInterval(timer)
  }, [profile, screen])

  useEffect(() => {
    if (screen !== 'battle') return
    if (!window.matchMedia('(min-width: 760px)').matches) return
    commandInputRef.current?.focus({ preventScroll: true })
  }, [screen, battle?.status])

  useEffect(() => {
    if (screen !== 'loading' || !loadingMission) return

    const handle = window.setTimeout(() => {
      setCountdown(3)
      setScreen('countdown')
    }, 2400)

    return () => window.clearTimeout(handle)
  }, [loadingMission, profile, screen])

  useEffect(() => {
    if (screen !== 'countdown' || !loadingMission) return

    const timer = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer)
          setBattle(createBattleState(loadingMission, profile))
          setScreen('battle')
          return 3
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(timer)
  }, [loadingMission, profile, screen])

  useEffect(() => {
    if (!battle || battle.status !== 'cleared' || battle.rewardApplied) return

    const rewardSummary = createMissionRewardSummary(profile, battle)
    const handle = window.setTimeout(() => {
      setProfile((current) => applyMissionReward(current, battle))
      setBattle((current) => (current ? battleReducer(current, { type: 'mark-reward-applied', rewardSummary }, profile) : current))
    }, 0)

    return () => window.clearTimeout(handle)
  }, [battle, profile])

  useEffect(() => {
    const status = battle?.status ?? null
    if (status && status !== lastBattleStatusRef.current) {
      if (status === 'cleared') playGameSound('clear', soundEnabled)
      if (status === 'defeated') playGameSound('defeat', soundEnabled)
    }
    lastBattleStatusRef.current = status
  }, [battle?.status, soundEnabled])

  useEffect(() => {
    if (!battle) {
      playedEffectIdsRef.current.clear()
      return
    }

    if (battle.status !== 'playing') {
      playedEffectIdsRef.current.clear()
      return
    }

    const activeEffectIds = new Set(battle.effects.map((effect) => effect.id))
    playedEffectIdsRef.current.forEach((id) => {
      if (!activeEffectIds.has(id)) playedEffectIdsRef.current.delete(id)
    })

    battle.effects.forEach((effect) => {
      if (playedEffectIdsRef.current.has(effect.id)) return
      playedEffectIdsRef.current.add(effect.id)
      playBattleEffectSound(effect, commandMeta, soundEnabled)
    })
  }, [battle, commandMeta, soundEnabled])

  function startMission(mission: Mission) {
    playGameSound('start', soundEnabled)
    setBgmActive('loading', soundEnabled)
    setLoadingMission(mission)
    setBattle(null)
    setCountdown(3)
    setCommandText('')
    setScreen('loading')
  }

  function navigateTo(nextScreen: Screen) {
    playGameSound('ui', soundEnabled)
    if (nextScreen !== 'techEditor' && window.location.hash === '#admin') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
    setScreen(nextScreen)
  }

  function toggleSound() {
    setSoundEnabled((current) => {
      const next = !current
      if (next) {
        playGameSound('ui', true)
        setBgmActive(getBgmMode(screen), true)
      } else {
        setBgmActive(null, false)
      }
      return next
    })
  }

  function playBattleCommandSound(command: string) {
    const normalized = command.trim().toLowerCase()
    if (!normalized || !availableCommands.includes(normalized)) {
      playGameSound('miss', soundEnabled)
      return
    }
    if (normalized === 'left' || normalized === 'right') {
      playGameSound('move', soundEnabled)
      return
    }
    if (normalized === 'guard') {
      playGameSound('guard', soundEnabled)
      return
    }
    playGameSound('attack', soundEnabled)
  }

  function submitBattleCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    playBattleCommandSound(commandText)
    setBattle((current) => (current ? battleReducer(current, { type: 'command', command: commandText, availableCommands, commandMeta }, profile) : current))
    setCommandText('')
  }

  function tapBattleCommand(command: string) {
    playBattleCommandSound(command)
    setBattle((current) => (current ? battleReducer(current, { type: 'command', command, availableCommands, commandMeta }, profile) : current))
    setCommandText('')
  }

  function learnSkill(skill: CommandDefinition) {
    const cost = skill.cost ?? 1
    if (profile.learned.includes(skill.command)) return
    if (profile.skillPoints < cost) return
    if (skill.prereq && !profile.learned.includes(skill.prereq)) return
    if ((skill.requiredLevel ?? 1) > profile.level) return

    setProfile((current) => ({
      ...current,
      skillPoints: current.skillPoints - cost,
      learned: [...current.learned, skill.command],
      equipped: current.equipped.length < 4 ? [...current.equipped, skill.command] : current.equipped,
    }))
  }

  async function signInWithGoogle() {
    if (!isFirebaseConfigured || authStarting) return
    setAuthStarting(true)
    setCloudStatus('Googleログインを開いています')
    try {
      const [{ getFirebaseServices }, { browserLocalPersistence, setPersistence, signInWithPopup, signInWithRedirect }] = await Promise.all([import('./firebaseClient'), import('firebase/auth')])
      const services = getFirebaseServices()
      if (!services) {
        setCloudStatus('Firebase設定を確認してください')
        return
      }
      await setPersistence(services.auth, browserLocalPersistence)
      services.googleProvider.setCustomParameters({ prompt: 'select_account' })
      try {
        await signInWithPopup(services.auth, services.googleProvider)
        setCloudStatus('ログインしました')
      } catch (popupError) {
        if (!shouldFallbackToRedirect(popupError)) throw popupError
        setCloudStatus('ポップアップで開けないため、Googleログインへ移動します')
        await signInWithRedirect(services.auth, services.googleProvider)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラー'
      setCloudStatus(`ログインを開始できませんでした: ${message}`)
    } finally {
      setAuthStarting(false)
    }
  }

  async function signOut() {
    if (!isFirebaseConfigured) return
    const [{ getFirebaseServices }, { signOut: firebaseSignOut }] = await Promise.all([import('./firebaseClient'), import('firebase/auth')])
    const services = getFirebaseServices()
    if (!services) return
    await firebaseSignOut(services.auth)
    setAuthUser(null)
    setIsAdminAccount(false)
    setCloudProfileReady(true)
    setCloudProfileOwner(null)
    setCloudStatus('ログアウトしました。この端末に保存中です')
  }

  async function saveTechniquesToCloud() {
    if (!isFirebaseConfigured || !authUser || !canEditTechniques) return

    setTechniqueSaveStatus('保存中...')
    try {
      const [{ getFirebaseServices }, { doc, serverTimestamp, writeBatch }] = await Promise.all([import('./firebaseClient'), import('firebase/firestore')])
      const services = getFirebaseServices()
      if (!services) return

      const firestore = services.db
      const batch = writeBatch(firestore)
      techniques.forEach((technique) => {
        batch.set(doc(firestore, 'techniques', technique.command), {
          ...technique,
          updatedBy: authUser.uid,
          updatedAt: serverTimestamp(),
        })
      })
      await batch.commit()
      setTechniqueSaveStatus('技データをクラウド保存しました')
    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラー'
      setTechniqueSaveStatus(`保存できませんでした: ${message}`)
    }
  }

  function updateTechnique(command: string, patch: Partial<CommandDefinition>) {
    if (!canEditTechniques) return
    setTechniques((current) => current.map((technique) => (technique.command === command ? { ...technique, ...patch } : technique)))
  }

  function resetTechniqueEditor() {
    if (!canEditTechniques) return
    setTechniques(mergeTechniqueDefinitions([]))
    setEditingCommand(defaultTechniqueDefinitions[0].command)
  }

  function toggleEquip(command: string) {
    setProfile((current) => {
      if (!current.learned.includes(command)) return current
      const equipped = current.equipped.includes(command)
        ? current.equipped.filter((item) => item !== command)
        : current.equipped.length < 4
          ? [...current.equipped, command]
          : current.equipped

      return { ...current, equipped }
    })
  }

  function claimDailyReward() {
    const today = getJstDateKey()
    setProfile((current) => {
      const daily = current.daily.goalDate === today ? current.daily : defaultDailyState(today)
      if (daily.dailyRewardClaimedDate === today) return current
      return {
        ...addProfileExp(current, 60),
        daily: {
          ...daily,
          lastLoginDate: today,
          dailyRewardClaimedDate: today,
        },
      }
    })
  }

  function claimGoalReward() {
    const today = getJstDateKey()
    setProfile((current) => {
      const daily = current.daily.goalDate === today ? current.daily : defaultDailyState(today)
      if (daily.goalClears < 1 || daily.goalRewardClaimedDate === today) return current
      return {
        ...addProfileExp(current, 120),
        daily: {
          ...daily,
          lastLoginDate: today,
          goalRewardClaimedDate: today,
        },
      }
    })
  }

  function claimLoginBonus() {
    const today = getJstDateKey()
    setProfile((current) => {
      if (current.loginBonus.lastClaimedDate === today) return current
      const stampIndex = current.loginBonus.stampIndex % 7
      const rewardExp = stampIndex === 6 ? 180 : 50 + stampIndex * 10
      return {
        ...addProfileExp(current, rewardExp),
        daily: {
          ...(current.daily.goalDate === today ? current.daily : defaultDailyState(today)),
          lastLoginDate: today,
        },
        loginBonus: {
          stampIndex: (stampIndex + 1) % 7,
          lastClaimedDate: today,
        },
      }
    })
  }

  const playerName = authUser?.displayName?.split(/\s+/)[0] || 'りせ'
  const today = getJstDateKey()
  const weekId = getJstWeekId()
  const expPercent = Math.min(100, Math.round((profile.exp / profile.expToNext) * 100))
  const todayDaily = profile.daily.goalDate === today ? profile.daily : defaultDailyState(today)
  const dailyClearCount = Math.min(1, todayDaily.goalClears)
  const dailyRewardClaimed = todayDaily.dailyRewardClaimedDate === today
  const goalRewardClaimed = todayDaily.goalRewardClaimedDate === today
  const goalRewardReady = dailyClearCount >= 1 && !goalRewardClaimed
  const loginBonusClaimed = profile.loginBonus.lastClaimedDate === today
  const loginBonusDay = (profile.loginBonus.stampIndex % 7) + 1
  const weeklyStats = profile.weeklyStats.weekId === weekId ? profile.weeklyStats : defaultWeeklyStats(weekId)
  const cloudOnline = Boolean(isFirebaseConfigured && authUser)
  const cloudLabel = authStarting ? 'クラウド保存：接続中' : `クラウド保存：${cloudOnline ? 'ON' : 'OFF'}`
  const visibleBattleReward = battle?.status === 'cleared' ? battle.rewardSummary ?? createMissionRewardSummary(profile, battle) : undefined

  return (
    <main className={`app-shell ${screen === 'home' ? 'home-app' : ''}`}>
      {screen !== 'home' && (
        <header className="app-header compact">
          <div className="header-copy">
            <>
              <span className="mini-label">タイピングレーンRPG</span>
              <p className="header-title">タイピングレーンRPG</p>
            </>
          </div>

          <nav className="top-nav" aria-label="main navigation">
            {navItems.map((item) => (
              <button
                key={item.screen}
                type="button"
                className={screen === item.screen ? 'active' : ''}
                aria-label={item.label}
                title={item.label}
                onClick={() => navigateTo(item.screen)}
              >
                <span aria-hidden="true">{item.emoji}</span>
              </button>
            ))}
            <button type="button" className="sound-nav-button" aria-label="sound" title="sound" onClick={toggleSound}>
              <span aria-hidden="true">{soundEnabled ? '🔊' : '🔇'}</span>
            </button>
          </nav>
        </header>
      )}

      {screen === 'home' && (
        <section className="page-shell home-dashboard">
          <section className="home-status-row" aria-label="ステータス">
            <article className="home-player-card">
              <div className="home-avatar" aria-hidden="true">
                🙂
              </div>
              <div className="home-player-info">
                <div className="home-player-top">
                  <strong>{playerName}</strong>
                  <b>Lv.{profile.level}</b>
                </div>
                <div className="home-exp-line">
                  <span>EXP</span>
                  <div className="home-exp-meter" aria-label="EXP">
                    <i style={{ width: `${expPercent}%` }} />
                  </div>
                  <em>
                    {profile.exp} / {profile.expToNext}
                  </em>
                </div>
              </div>
            </article>

            <article className="home-sp-card">
              <span aria-hidden="true">⭐</span>
              <div>
                <strong>SP</strong>
                <b>{profile.skillPoints}</b>
              </div>
            </article>

            <button
              type="button"
              className={`home-cloud-card ${cloudOnline ? 'online' : ''}`}
              onClick={authUser ? signOut : signInWithGoogle}
              disabled={!isFirebaseConfigured || authStarting}
              title={cloudStatus}
            >
              <span aria-hidden="true">☁️</span>
              <strong>{cloudLabel}</strong>
              <i aria-hidden="true" />
            </button>

            <button type="button" className={`home-sound-card ${soundEnabled ? 'on' : ''}`} aria-label="sound" title="sound" onClick={toggleSound}>
              <span aria-hidden="true">{soundEnabled ? '🔊' : '🔇'}</span>
            </button>
          </section>

          <section className="home-main-panel">
            <section className="home-title-zone" aria-labelledby="home-title">
              <div className="home-title-line">
                <span className="home-title-sword" aria-hidden="true">
                  🗡️
                </span>
                <div>
                  <h1 id="home-title">
                    タイピング
                    <br />
                    レーン<span>RPG</span>
                  </h1>
                  <p>✨ タイピングで冒険を進めよう！ ✨</p>
                </div>
              </div>

              <div className="home-primary-actions" aria-label="メインメニュー">
                <button type="button" className="home-action-card mission" onClick={() => navigateTo('missions')}>
                  <span aria-hidden="true">🗡️</span>
                  <strong>ミッション</strong>
                  <em>ステージに挑戦！</em>
                  <b aria-hidden="true">›</b>
                </button>

                <button type="button" className="home-action-card growth" onClick={() => navigateTo('growth')}>
                  <span aria-hidden="true">📗</span>
                  <strong>育成</strong>
                  <em>コマンドをおぼえる！</em>
                  <b aria-hidden="true">›</b>
                </button>
              </div>
            </section>

            <aside className="home-side-zone">
              <section className="home-notice-card" aria-labelledby="home-notice-title">
                <h2 id="home-notice-title">
                  <span aria-hidden="true">🔔</span>
                  お知らせ
                </h2>
                <button type="button" className={dailyRewardClaimed ? 'claimed' : ''} onClick={claimDailyReward} disabled={dailyRewardClaimed}>
                  <span aria-hidden="true">🎁</span>
                  <strong>{dailyRewardClaimed ? 'デイリーボーナス受け取り済み' : 'デイリーボーナス EXP 60'}</strong>
                  <b aria-hidden="true">›</b>
                </button>
                <button type="button" className={loginBonusClaimed ? 'claimed' : ''} onClick={claimLoginBonus} disabled={loginBonusClaimed}>
                  <span aria-hidden="true">🗓️</span>
                  <strong>{loginBonusClaimed ? 'ログインボーナス受け取り済み' : `ログインボーナス ${loginBonusDay}日目`}</strong>
                  <em>{loginBonusClaimed ? 'また明日' : loginBonusDay === 7 ? 'EXP 180' : `EXP ${50 + (loginBonusDay - 1) * 10}`}</em>
                  <b aria-hidden="true">›</b>
                </button>
                <button type="button" onClick={() => navigateTo('missions')}>
                  <span aria-hidden="true">🏆</span>
                  <strong>今週のきろく</strong>
                  <em>{weeklyStats.clears}回クリア / 最高ステージ{weeklyStats.highestStage} / 星{weeklyStats.totalStars}</em>
                  <b aria-hidden="true">›</b>
                </button>
              </section>

              <section className="home-goal-card" aria-labelledby="home-goal-title">
                <h2 id="home-goal-title">
                  <span aria-hidden="true">🎯</span>
                  今日の目標
                </h2>
                <div className="home-goal-body">
                  <div>
                    <strong>ステージを1回クリアしよう</strong>
                    <div className="home-goal-meter" aria-label="今日の目標">
                      <i style={{ width: `${dailyClearCount * 100}%` }} />
                    </div>
                    {goalRewardReady ? (
                      <button type="button" className="goal-reward-button" onClick={claimGoalReward}>
                        EXP 120を受け取る
                      </button>
                    ) : goalRewardClaimed ? (
                      <small>報酬を受け取りました</small>
                    ) : null}
                  </div>
                  <b>
                    {dailyClearCount} / 1
                  </b>
                  <span aria-hidden="true">🎁</span>
                </div>
              </section>
            </aside>
          </section>

          <section className="home-guide-panel" aria-labelledby="home-guide-title">
            <h2 id="home-guide-title">あそびかた 📖</h2>
            <div className="home-guide-flow">
              {[
                ['👁️', 'よくみる', 'てきの うごきに ちゅうい！'],
                ['⌨️', 'タイピング', 'コマンドを にゅうりょく！'],
                ['🏃', 'よける・まもる', 'うごいたり ガードで ダメージをへらそう！'],
                ['🗡️', 'こうげきする', 'てきの よわてを ついて こうげきだ！'],
                ['✨', 'かち！', 'ステージクリアで つよくなる！'],
              ].map(([icon, title, text], index, items) => (
                <div className="home-guide-step" key={title}>
                  <span aria-hidden="true">{icon}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                  {index < items.length - 1 ? <b aria-hidden="true">›</b> : null}
                </div>
              ))}
            </div>
          </section>
        </section>
      )}

      {screen === 'missions' && (
        <section className="page-shell">
          <section className="section-card">
            <div className="section-heading">
              <div>
                <span className="mini-label">ミッション</span>
                <h2>ステージを えらぶ</h2>
              </div>
            </div>
            <div className="mission-list">
              {missions.map((mission, index) => {
                const record = profile.missionRecords[mission.id]
                const cleared = Boolean(record?.clears || profile.missionWins.includes(mission.id))
                const previousMission = missions[index - 1]
                const previousCleared = previousMission
                  ? Boolean(profile.missionRecords[previousMission.id]?.clears || profile.missionWins.includes(previousMission.id))
                  : true
                const unlocked = index === 0 || previousCleared
                return (
                  <article key={mission.id} className={`mission-card ${cleared ? 'cleared' : ''} ${!unlocked ? 'locked' : ''}`}>
                    <div className="mission-card-top">
                      <span>Stage {index + 1}</span>
                      <b>{cleared ? 'クリア' : unlocked ? '挑戦' : '未解放'}</b>
                    </div>
                    <strong>{mission.name}</strong>
                    <StarRating value={record?.bestStars ?? 0} />
                    <p>{mission.description}</p>
                    <div className="mission-meta">
                      <span>💪 {mission.strength}</span>
                      <span>⭐ {mission.rewardText.replace('ほうしゅう ', '')}</span>
                    </div>
                    <button type="button" disabled={!unlocked} onClick={() => startMission(mission)}>
                      {unlocked ? 'ちょうせん' : 'ロック中'}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        </section>
      )}

      {screen === 'growth' && (
        <section className="page-shell growth-page">
          <section className="section-card growth-hero-card">
            <h2 aria-label="育成">🌱</h2>
            <div className="growth-status-pills">
              <span className="level">
                <small>Lv.</small>
                <strong>{profile.level}</strong>
              </span>
              <span className="sp">
                <b aria-hidden="true">⭐</b>
                <small>SP</small>
                <strong>{profile.skillPoints}</strong>
              </span>
              <span className="learned">
                <b aria-hidden="true">📘</b>
                <small>技</small>
                <strong>{profile.learned.length}</strong>
              </span>
            </div>
          </section>

          <section className="growth-tabs" role="tablist" aria-label="育成メニュー">
            <button type="button" className={growthTab === 'equip' ? 'active' : ''} role="tab" aria-selected={growthTab === 'equip'} onClick={() => setGrowthTab('equip')}>
              <span aria-hidden="true">🎒</span>
              <strong>そうび</strong>
            </button>
            <button type="button" className={growthTab === 'tree' ? 'active' : ''} role="tab" aria-selected={growthTab === 'tree'} onClick={() => setGrowthTab('tree')}>
              <span aria-hidden="true">🌱</span>
              <strong>スキルツリー</strong>
            </button>
          </section>

          {growthTab === 'equip' ? (
            <section className="section-card equip-panel">
            <div className="section-heading">
              <div>
                <span className="mini-label">そうび</span>
                <h2>そうびする コマンド</h2>
                <p className="section-note">
                  そうびした コマンドだけ <ruby>技<rt>わざ</rt></ruby>が <ruby>発動<rt>はつどう</rt></ruby>します
                </p>
              </div>
            </div>
            <div className="always-command-panel" aria-label="いつでも使えるコマンド">
              <div>
                <strong>いつでも使える</strong>
                <span>移動・ガードは装備枠を使いません</span>
              </div>
              <div className="always-command-list">
                {fixedCommandDefinitions.map((command) => (
                  <article key={command.command} className={`always-command-card ${command.tone}`}>
                    <span aria-hidden="true">{command.emoji}</span>
                    <strong>{command.title}</strong>
                    <em>コマンド: {command.command}</em>
                  </article>
                ))}
              </div>
            </div>
            <div className="equip-layout">
              <div className="equip-slot-board" aria-label="装備中のコマンド">
                {Array.from({ length: 4 }).map((_, index) => {
                  const command = profile.equipped[index]
                  const meta = command ? commandMeta[command] : undefined
                  return (
                    <article key={`slot-${index}`} className={`equip-slot ${meta ? 'filled' : ''}`}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{meta?.title ?? 'なし'}</strong>
                        {command ? <em>コマンド: {command}</em> : <em>空き</em>}
                      </div>
                      {meta ? <b aria-hidden="true">{meta.emoji}</b> : null}
                      {meta ? (
                        <div className="equip-detail-row">
                          <small>{getPowerText(meta)}</small>
                          <small>{getRangeText(meta)}</small>
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>

              <div className="equip-library">
                <div className="equip-library-heading">
                  <strong>おぼえた技</strong>
                  <span>
                    {filteredLearnedTechniqueCommands.length}件 / {learnedTechniqueCommands.length}件・{profile.equipped.length}/4そうび
                  </span>
                </div>
                <div className="learned-filter-list" aria-label="覚えた技フィルター">
                  {learnedFilterOptions.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={learnedFilter === filter.id ? 'active' : ''}
                      onClick={() => setLearnedFilter(filter.id)}
                    >
                      <span aria-hidden="true">{filter.icon}</span>
                      {filter.label}
                    </button>
                  ))}
                </div>
                <div className="equip-command-list">
                  {filteredLearnedTechniqueCommands.length === 0 ? <p className="equip-empty">このフィルターの技はまだありません。</p> : null}
                  {filteredLearnedTechniqueCommands.map((command) => {
                    const meta = commandMeta[command]
                    const equipped = profile.equipped.includes(command)
                    const full = profile.equipped.length >= 4 && !equipped
                    return (
                      <button
                        key={command}
                        type="button"
                        className={`equip-command-card ${equipped ? 'equipped' : ''}`}
                        onClick={() => toggleEquip(command)}
                        disabled={full}
                      >
                        <span className={`skill-icon ${meta?.tone ?? 'attack'}`}>{meta?.emoji ?? '✨'}</span>
                        <span className="equip-command-copy">
                          <strong>{meta?.title ?? command}</strong>
                          <em>コマンド: {command}</em>
                          <span>
                            <small>{getPowerText(meta)}</small>
                            <small>{getRangeText(meta)}</small>
                          </span>
                        </span>
                        <b>{equipped ? 'そうび中' : full ? '4つまで' : 'そうび'}</b>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>
          ) : (

            <section className="section-card learn-panel">
            <div className="section-heading">
              <div>
                <span className="mini-label">スキルツリー</span>
                <h2>SPをつかって コマンドをおぼえる</h2>
                <p className="section-note">レベルが 1 あがるごとに 1 SP かくとく。後ろの列ほど強いコマンドです。</p>
              </div>
            </div>
            <div className="skill-tree-tabs" role="tablist" aria-label="スキルツリー">
              {skillTreeGroups.map((group) => {
                const learnedCount = group.skills.filter((skill) => profile.learned.includes(skill.command)).length
                const selected = group.tree === selectedSkillTree
                return (
                  <button
                    key={group.tree}
                    type="button"
                    className={`skill-tree-tab ${group.tree} ${selected ? 'active' : ''}`}
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setSelectedSkillTree(group.tree)}
                  >
                    <span aria-hidden="true">{group.icon}</span>
                    <strong>{group.title}</strong>
                    <em>
                      {learnedCount}/{group.skills.length}
                    </em>
                  </button>
                )
              })}
            </div>

            {selectedSkillTreeGroup ? (
              <article className={`skill-tree-column focused ${selectedSkillTreeGroup.tree}`}>
                <header>
                  <span aria-hidden="true">{selectedSkillTreeGroup.icon}</span>
                  <div>
                    <strong>{selectedSkillTreeGroup.title}</strong>
                    <p>{selectedSkillTreeGroup.desc}</p>
                  </div>
                </header>
                <div className="skill-tier-list">
                  {selectedSkillTiers.map((tierGroup) => (
                    <section key={tierGroup.tier} className="skill-tier-group">
                      <div className="skill-tier-heading">
                        <span>STEP {tierGroup.tier}</span>
                        <i />
                      </div>
                      <div className="skill-tree-nodes">
                        {tierGroup.skills.map((skill) => {
                          const learned = profile.learned.includes(skill.command)
                          const prereqLocked = Boolean(skill.prereq && !profile.learned.includes(skill.prereq))
                          const levelLocked = (skill.requiredLevel ?? 1) > profile.level
                          const affordable = profile.skillPoints >= (skill.cost ?? 1)
                          const disabled = learned || prereqLocked || levelLocked || !affordable
                          const meta = commandMeta[skill.command]

                          return (
                            <button
                              key={skill.command}
                              type="button"
                              className={`skill-node tier-${skill.tier ?? 1} ${learned ? 'learned' : ''} ${disabled && !learned ? 'locked' : ''}`}
                              disabled={disabled}
                              onClick={() => learnSkill(skill)}
                            >
                              <span className={`skill-icon ${meta?.tone ?? 'attack'}`}>{meta?.emoji ?? '✨'}</span>
                              <span className="skill-main-copy">
                                <strong>{skill.title}</strong>
                                <span className="skill-command-spell">{skill.command}</span>
                              </span>
                              <em>
                                Lv.{skill.requiredLevel ?? 1} / {skill.cost ?? 1}SP
                              </em>
                              {getPowerText(meta) ? <small>{getPowerText(meta)}</small> : null}
                              {getRangeText(meta) ? <small>{getRangeText(meta)}</small> : null}
                              <b>{getUnlockText(skill, profile)}</b>
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </article>
            ) : null}
            </section>
          )}
        </section>
      )}

      {screen === 'techEditor' && (!isFirebaseConfigured || !authUser || !adminReady || !adminEmailAllowed || !isAdminAccount) && (
        <section className="page-shell">
          <section className="section-card admin-gate">
            <span className="mini-label">管理者ツール</span>
            <h2>技データ管理</h2>
            {!isFirebaseConfigured ? (
              <p>Firebaseの設定値を .env に入れると、進捗と技データをクラウドで管理できます。</p>
            ) : !authUser ? (
              <>
                <p>管理者のGoogleアカウントでログインしてください。</p>
                <button type="button" className="soft-button" onClick={signInWithGoogle} disabled={!authReady || authStarting}>
                  {authStarting ? 'ログイン中...' : 'Googleでログイン'}
                </button>
              </>
            ) : !adminReady ? (
              <p>管理者権限を確認しています。</p>
            ) : !adminEmailAllowed ? (
              <p>このメールアドレスは管理者として許可されていません。</p>
            ) : (
              <p>Firestoreの admins コレクションに、このユーザーIDのドキュメントを追加してください: {authUser.uid}</p>
            )}
          </section>
        </section>
      )}

      {screen === 'techEditor' && canEditTechniques && editingTechnique && (
        <section className="page-shell editor-layout">
          <section className="section-card editor-list-card">
            <div className="section-heading">
              <div>
                <span className="mini-label">管理者ツール</span>
                <h2>技データを編集</h2>
              </div>
              <div className="editor-actions">
                <button type="button" className="soft-button" onClick={resetTechniqueEditor}>
                  初期化
                </button>
                <button type="button" className="soft-button primary-soft" onClick={saveTechniquesToCloud}>
                  クラウド保存
                </button>
              </div>
            </div>
            <p className="section-note">{techniqueSaveStatus || 'ゲーム外の管理者画面です。保存すると全ユーザーのゲームに反映されます。'}</p>
            <div className="tech-list">
              {techniques.map((technique) => (
                <button
                  key={technique.command}
                  type="button"
                  className={`tech-list-button ${editingTechnique.command === technique.command ? 'active' : ''}`}
                  onClick={() => setEditingCommand(technique.command)}
                >
                  <span>{technique.emoji}</span>
                  <strong>{technique.title}</strong>
                  <small>{technique.command}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="section-card editor-panel">
            <div>
              <span className="mini-label">発動コマンド: {editingTechnique.command}</span>
              <h2>{editingTechnique.title}</h2>
            </div>

            <div className="editor-preview">
              <CommandButton command={editingTechnique.command} meta={editingTechnique} onClick={() => undefined} />
            </div>

            <div className="editor-form">
              <label>
                技名（日本語）
                <input value={editingTechnique.title} onChange={(event) => updateTechnique(editingTechnique.command, { title: event.target.value })} />
              </label>
              <label>
                説明
                <input value={editingTechnique.desc} onChange={(event) => updateTechnique(editingTechnique.command, { desc: event.target.value })} />
              </label>
              <label>
                アイコン
                <input value={editingTechnique.emoji} onChange={(event) => updateTechnique(editingTechnique.command, { emoji: event.target.value })} />
              </label>
              <label>
                威力
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={editingTechnique.power ?? 1}
                  onChange={(event) => updateTechnique(editingTechnique.command, { power: Number(event.target.value) })}
                />
              </label>
              <label>
                攻撃範囲
                <select value={editingTechnique.rangeMode ?? 'line'} onChange={(event) => updateTechnique(editingTechnique.command, { rangeMode: event.target.value as RangeMode })}>
                  <option value="front">目の前1マス</option>
                  <option value="line">一直線に〇マス</option>
                  <option value="exact">〇マス先だけ</option>
                </select>
              </label>
              <label>
                射程マス
                <select value={editingTechnique.range ?? 1} onChange={(event) => updateTechnique(editingTechnique.command, { range: Number(event.target.value) })}>
                  <option value={1}>1マス</option>
                  <option value={2}>2マス</option>
                  <option value={3}>3マス</option>
                </select>
              </label>
              <label>
                エフェクト
                <select
                  value={editingTechnique.effectStyle ?? 'slash'}
                  onChange={(event) => {
                    const effectStyle = event.target.value as EffectStyle
                    updateTechnique(editingTechnique.command, { effectStyle, icon: effectStyleIcon(effectStyle) })
                  }}
                >
                  <option value="slash">斬撃</option>
                  <option value="arrow">矢</option>
                  <option value="fire">炎</option>
                  <option value="bolt">雷</option>
                  <option value="ice">氷</option>
                  <option value="wind">風</option>
                  <option value="stone">石</option>
                  <option value="light">光</option>
                  <option value="dark">闇</option>
                  <option value="water">水</option>
                </select>
              </label>
              <label>
                習得SP
                <input
                  type="number"
                  min={0}
                  max={9}
                  value={editingTechnique.cost ?? 0}
                  onChange={(event) => updateTechnique(editingTechnique.command, { cost: Number(event.target.value) })}
                />
              </label>
              <label>
                必要レベル
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={editingTechnique.requiredLevel ?? 1}
                  onChange={(event) => updateTechnique(editingTechnique.command, { requiredLevel: Number(event.target.value) })}
                />
              </label>
              <label>
                前提コマンド
                <select
                  value={editingTechnique.prereq ?? ''}
                  onChange={(event) => updateTechnique(editingTechnique.command, { prereq: event.target.value || undefined })}
                >
                  <option value="">なし</option>
                  {[...fixedCommandDefinitions, ...techniques]
                    .filter((technique) => technique.command !== editingTechnique.command)
                    .map((technique) => (
                      <option key={technique.command} value={technique.command}>
                        {technique.command}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                ツリー
                <select value={editingTechnique.tree ?? 'range'} onChange={(event) => updateTechnique(editingTechnique.command, { tree: event.target.value as SkillTreeId })}>
                  {skillTreeOrder.map((tree) => (
                    <option key={tree} value={tree}>
                      {skillTreeInfo[tree].title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </section>
      )}

      {screen === 'loading' && loadingMission && (
        <section className="page-shell">
          <section className="section-card loading-card">
            <div className="section-heading">
              <div>
                <span className="mini-label">クエストしゅっぱつ</span>
                <h2>{loadingMission.name} に むかっています</h2>
              </div>
            </div>

            <div className="loading-route">
              <div className="loading-track">
                <span className="loading-stop">🏠</span>
                <span className="loading-stop">🗺️</span>
                <span className="loading-stop">⚔️</span>
                <span className="loading-runner" aria-hidden="true">
                  🧍
                </span>
              </div>
              <div className="loading-copy">
                <strong>{loadingMission.description}</strong>
                <span>つよさ {loadingMission.strength}</span>
                <span>ほうしゅう {loadingMission.rewardText}</span>
              </div>
            </div>
          </section>
        </section>
      )}

      {screen === 'countdown' && loadingMission && (
        <section className="page-shell">
          <section className="section-card countdown-card">
            <span className="mini-label">バトルじゅんび</span>
            <h2>{loadingMission.name}</h2>
            <div className="countdown-number" aria-label={`戦闘開始まで ${countdown} 秒`}>
              {countdown}
            </div>
            <strong>バトル開始まで</strong>
            <p>入力欄にコマンドを打って Enter を押すと、コマンドが発動します。</p>
            <div className="countdown-command-preview" aria-hidden="true">
              <span>コマンド</span>
              <b>hit</b>
              <em>Enter</em>
            </div>
          </section>
        </section>
      )}

      {screen === 'battle' && battle && (
        <section className="battle-page">
          <div className="battle-header">
            <div>
              <span className="mini-label">{battle.mission.name}</span>
              <h2>ことばを うとう</h2>
            </div>
          </div>

          <section className="battle-layout">
            <section className="arena-card">
              <div className="arena-board">
                <div className="lane-labels">
                  {laneLabels.map((lane) => (
                    <span key={lane}>{lane}</span>
                  ))}
                </div>

                <div className="board-grid">
                  {(['far', 'mid', 'near'] as Distance[]).map((track) => (
                    <div className="grid-row" key={track}>
                      {([0, 1, 2] as Lane[]).map((lane) => (
                        <BoardCell key={`${track}-${lane}`} highlight={getBattleCellHighlight(battle.enemies, track, lane)} playerRow={false} />
                      ))}
                    </div>
                  ))}

                  <div className="gap-row">
                    <div className="gap-banner">ここだけ うごける</div>
                  </div>

                  <div className="grid-row">
                    {([0, 1, 2] as Lane[]).map((lane) => (
                      <BoardCell key={`player-${lane}`} highlight={getBattleCellHighlight(battle.enemies, 'player', lane)} playerRow />
                    ))}
                  </div>
                </div>

                <div className="actor-layer">
                  {battle.enemies
                    .filter((enemy) => enemy.hp > 0)
                    .map((enemy) => (
                      <ActorToken
                        key={enemy.id}
                        kind="enemy"
                        lane={enemy.lane}
                        track={enemy.distance}
                        hpPercent={enemy.hp / enemy.maxHp}
                        hpText={`${enemy.hp}/${enemy.maxHp}`}
                        warning={enemy.warning}
                        flash={enemy.flashMs > 0}
                      />
                    ))}
                  <ActorToken
                    kind="player"
                    lane={battle.playerLane}
                    track="player"
                    hpPercent={battle.playerHp / battle.maxPlayerHp}
                    hpText={`${battle.playerHp}/${battle.maxPlayerHp}`}
                    warning={battle.guardMs > 0 ? { icon: 'guard', label: 'guard', timeText: `${(battle.guardMs / 1000).toFixed(1)}` } : undefined}
                    flash={battle.playerFlashMs > 0}
                  />
                  {battle.effects.map((effect) => (
                    <EffectSprite key={effect.id} effect={effect} />
                  ))}
                </div>
              </div>

              <form className="command-form" onSubmit={submitBattleCommand}>
                <label htmlFor="command">⌨️</label>
                <div className="command-line">
                  <input
                    id="command"
                    ref={commandInputRef}
                    value={commandText}
                    onChange={(event) => setCommandText(event.target.value)}
                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                      if (event.key !== 'Enter') return
                      event.preventDefault()
                      tapBattleCommand(commandText)
                    }}
                    placeholder="コマンド"
                    autoComplete="off"
                  />
                  <button type="submit">OK</button>
                </div>
              </form>
            </section>

            <section className="battle-side">
              <div className="command-grid">
                {availableCommands.map((command) => (
                  <CommandButton key={command} command={command} meta={commandMeta[command]} onClick={() => tapBattleCommand(command)} />
                ))}
              </div>
            </section>
          </section>

          {battle.status !== 'playing' && (
            battle.status === 'cleared' ? (
              <div className="result-panel victory-panel" role="status" aria-live="polite">
                <div className="victory-confetti" aria-hidden="true">
                  {Array.from({ length: 18 }).map((_, index) => (
                    <i key={index} style={{ '--x': `${(index % 9) * 11 + 4}%`, '--d': `${(index % 5) * 80}ms` } as CSSProperties} />
                  ))}
                </div>
                <div className="victory-medal" aria-hidden="true">
                  🏆
                </div>
                <span className="victory-kicker">ステージクリア！</span>
                <strong>やったね！</strong>
                <p>{battle.mission.name} をクリアしました。</p>
                {visibleBattleReward ? (
                  <div className="victory-stars">
                    <StarRating value={visibleBattleReward.stars} label={`今回の星${visibleBattleReward.stars}こ`} />
                    <span>{visibleBattleReward.bestUpdated ? 'ベスト更新！' : '今回の星'}</span>
                  </div>
                ) : null}
                <div className="victory-reward">
                  <span aria-hidden="true">⭐</span>
                  <div>
                    <small>ほうしゅう</small>
                    <b>EXP {visibleBattleReward?.totalExp ?? battle.mission.rewardExp}</b>
                    {visibleBattleReward ? (
                      <em>
                        {visibleBattleReward.firstClear ? '初回クリア' : '再クリア'} EXP {visibleBattleReward.baseExp}
                        {visibleBattleReward.starBonusExp > 0 ? ` + 星ボーナス ${visibleBattleReward.starBonusExp}` : ''}
                      </em>
                    ) : null}
                  </div>
                </div>
                {visibleBattleReward ? (
                  <div className="victory-stats" aria-label="クリア記録">
                    <span>HP {visibleBattleReward.remainingHp}</span>
                    <span>ミス {visibleBattleReward.missCommands}</span>
                    <span>{formatClearTime(visibleBattleReward.clearTimeMs)}</span>
                  </div>
                ) : null}
                <div className="result-actions">
                  {getNextMission(battle.mission) ? (
                    <button type="button" className="primary-result-action" onClick={() => startMission(getNextMission(battle.mission)!)}>
                      つぎのステージ
                    </button>
                  ) : null}
                  <button type="button" onClick={() => setScreen('growth')}>
                    育成へ
                  </button>
                  <button type="button" onClick={() => startMission(battle.mission)}>
                    もういちど
                  </button>
                  <button type="button" onClick={() => setScreen('home')}>
                    ホーム
                  </button>
                </div>
              </div>
            ) : (
              <div className="result-panel defeat-panel" role="status">
                <strong>ゲームオーバー</strong>
                <span>もういちど やってみよう</span>
                <div className="result-actions">
                  <button type="button" onClick={() => startMission(battle.mission)}>
                    もういちど
                  </button>
                  <button type="button" onClick={() => setScreen('growth')}>
                    育成
                  </button>
                  <button type="button" onClick={() => setScreen('home')}>
                    ホーム
                  </button>
                </div>
              </div>
            )
          )}
        </section>
      )}

    </main>
  )
}

function getBattleCellHighlight(enemies: EnemyState[], track: Track, lane: Lane): 'none' | 'move' | 'attack' {
  const highlights = enemies
    .filter((enemy) => enemy.hp > 0)
    .map((enemy) => getCellHighlight(enemy.warning, enemy.lane, enemy.distance, track, lane))
  return highlights.includes('attack') ? 'attack' : highlights.includes('move') ? 'move' : 'none'
}

function getCellHighlight(
  warning: Warning | undefined,
  enemyLane: Lane,
  enemyDistance: Distance,
  track: Track,
  lane: Lane,
): 'none' | 'move' | 'attack' {
  if (!warning) return 'none'

  if (warning.type === 'move-lane') return warning.nextLane === lane && track === enemyDistance ? 'move' : 'none'
  if (warning.type === 'move-near' || warning.type === 'move-far') {
    return enemyLane === lane && track === warning.nextDistance ? 'move' : 'none'
  }
  if (warning.type === 'weak') return enemyLane === lane && track === enemyDistance ? 'move' : 'none'
  if (warning.type === 'ranged') {
    return warning.lane === lane && track !== 'player' && distanceRank(track) <= distanceRank(enemyDistance)
      ? 'attack'
      : warning.lane === lane && track === 'player'
        ? 'attack'
        : 'none'
  }
  if (warning.type === 'melee' || warning.type === 'unblockable') {
    return warning.lane === lane && (track === 'near' || track === 'player') ? 'attack' : 'none'
  }

  return 'none'
}

function BoardCell({ highlight, playerRow }: { highlight: 'none' | 'move' | 'attack'; playerRow: boolean }) {
  return <div className={`board-cell ${playerRow ? 'player-row' : ''} ${highlight !== 'none' ? highlight : ''}`} />
}

function ActorToken({
  kind,
  lane,
  track,
  hpPercent,
  hpText,
  warning,
  flash,
}: {
  kind: 'player' | 'enemy'
  lane: Lane
  track: Track
  hpPercent: number
  hpText: string
  warning?:
    | Warning
    | {
        icon: IconKind
        label: string
        timeText: string
      }
  flash: boolean
}) {
  const style = {
    left: `${lanePercent(lane)}%`,
    top: `${trackPercent(track)}%`,
  }

  const bubble =
    warning && 'timeLeft' in warning
      ? {
          icon: warning.icon,
          timeText: `${(warning.timeLeft / 1000).toFixed(1)}`,
          tone: (warning.type.startsWith('move') || warning.type === 'weak' ? 'move' : 'attack') as 'move' | 'attack',
        }
      : warning
        ? {
            icon: warning.icon,
            timeText: warning.timeText,
            tone: (warning.icon === 'guard' ? 'move' : 'attack') as 'move' | 'attack',
          }
        : undefined

  return (
    <div className={`actor-token ${kind} ${flash ? 'flash' : ''}`} style={style}>
      {bubble ? <ActionBadge icon={bubble.icon} tone={bubble.tone} timerText={bubble.timeText} /> : <div className="badge-spacer" />}
      <TinyBar value={hpPercent * 100} tone={kind} text={hpText} />
      {kind === 'enemy' ? <EnemySprite weak={Boolean(warning && 'type' in warning && warning.type === 'weak' && warning.phase === 'active')} /> : <PlayerSprite guarding={bubble?.icon === 'guard'} />}
    </div>
  )
}

function TinyBar({ value, tone, text }: { value: number; tone: 'player' | 'enemy'; text?: string }) {
  return (
    <div className={`tiny-bar-wrap ${tone}`}>
      {text ? <span>{text}</span> : null}
      <div className={`tiny-bar ${tone}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

function StarRating({ value, label }: { value: number; label?: string }) {
  return (
    <div className="star-rating" aria-label={label ?? `星${value}こ`}>
      {[1, 2, 3].map((star) => (
        <span key={star} className={star <= value ? 'earned' : 'empty'} aria-hidden="true">
          ★
        </span>
      ))}
    </div>
  )
}

function formatClearTime(ms: number) {
  if (!ms) return '0秒'
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  return `${seconds}秒`
}

function CommandButton({ command, meta, onClick }: { command: string; meta?: CommandDefinition; onClick: () => void }) {
  const powerText = getPowerText(meta)
  const rangeText = getRangeText(meta)
  return (
    <button type="button" className={`command-button ${meta?.tone ?? 'attack'}`} onClick={onClick}>
      <span className="command-button-icon">{meta?.emoji ?? '✨'}</span>
      <span className="command-button-copy">
        <strong>{meta?.title ?? command}</strong>
        <em>コマンド: {command}</em>
        <span className="command-button-details">
          {meta?.desc ? <small>{meta.desc}</small> : null}
          {powerText ? <small>{powerText}</small> : null}
          {rangeText ? <small>{rangeText}</small> : null}
        </span>
      </span>
    </button>
  )
}

function ActionBadge({ icon, tone, timerText }: { icon: IconKind; tone: 'move' | 'attack'; timerText: string }) {
  return (
    <div className={`action-badge ${tone}`}>
      <span className="emoji-icon">{iconEmoji(icon)}</span>
      <span>{timerText}</span>
    </div>
  )
}

function EffectSprite({ effect }: { effect: BattleEffect }) {
  const progress = Math.max(0, Math.min(1, effect.elapsed / effect.duration))
  const startTop = trackPercent(effect.fromTrack)
  const endTop = trackPercent(effect.toTrack)
  const dx = 0
  const dy = endTop >= startTop ? 1 : -1
  const style = {
    left: `${lanePercent(effect.lane)}%`,
    top: `${startTop + (endTop - startTop) * progress}%`,
    '--dx': dx,
    '--dy': dy,
    '--trail-y': `${dy * 22}px`,
    '--progress': progress,
  }

  return (
    <div className={`effect-sprite ${effect.owner} ${effect.type}`} style={style}>
      <span className="emoji-icon">{iconEmoji(effect.icon)}</span>
    </div>
  )
}

function PlayerSprite({ guarding }: { guarding: boolean }) {
  return (
    <div className={`sprite player-sprite ${guarding ? 'guarding' : ''}`} aria-label="player">
      <img src="/assets/battle-hero.png" alt="" draggable={false} />
      {guarding ? <span className="pixel-shield" /> : null}
    </div>
  )
}

function EnemySprite({ weak }: { weak: boolean }) {
  return (
    <div className={`sprite enemy-sprite ${weak ? 'weak' : ''}`} aria-label="enemy">
      <img src="/assets/battle-enemy.png" alt="" draggable={false} />
    </div>
  )
}

function iconEmoji(kind: IconKind) {
  switch (kind) {
    case 'left':
      return '⬅️'
    case 'right':
      return '➡️'
    case 'move':
      return '↔️'
    case 'down':
      return '⬇️'
    case 'up':
      return '⬆️'
    case 'bolt':
      return '⚡'
    case 'shot':
      return '🏹'
    case 'slash':
      return '⚔️'
    case 'danger':
      return '❗'
    case 'fire':
      return '🔥'
    case 'guard':
      return '🛡️'
    case 'star':
      return '⭐'
    case 'exp':
      return '✨'
    case 'sp':
      return '🌱'
    case 'ice':
      return '🧊'
    case 'wind':
      return '🌪️'
    case 'stone':
      return '🪨'
    case 'light':
      return '🔆'
    case 'dark':
      return '🌑'
    case 'water':
      return '💧'
    default:
      return '•'
  }
}

export default App
