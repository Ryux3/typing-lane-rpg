import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import './App.css'

type Screen = 'home' | 'missions' | 'growth' | 'loading' | 'battle'
type Lane = 0 | 1 | 2
type Distance = 'far' | 'mid' | 'near'
type Track = Distance | 'player'
type Status = 'playing' | 'cleared' | 'defeated'
type WarningType = 'move-lane' | 'move-near' | 'move-far' | 'ranged' | 'melee' | 'unblockable' | 'weak'
type EffectType = 'player-shot' | 'player-hit' | 'player-fire' | 'enemy-bolt' | 'enemy-dash'
type IconKind = 'move' | 'down' | 'up' | 'bolt' | 'slash' | 'danger' | 'fire' | 'guard' | 'left' | 'right' | 'shot' | 'star' | 'exp' | 'sp'

type Mission = {
  id: string
  name: string
  description: string
  strength: string
  rewardText: string
  rewardExp: number
  enemyHp: number
  actionDelayMs: number
  warningMs: {
    move: number
    attack: number
  }
}

type Skill = {
  command: string
  label: string
  cost: number
  prereq?: string
  description: string
}

type ProfileState = {
  level: number
  exp: number
  expToNext: number
  skillPoints: number
  learned: string[]
  equipped: string[]
  missionWins: string[]
}

type Warning = {
  id: number
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
  powerLabel?: string
  rangeLabel?: string
}

type BattleState = {
  mission: Mission
  status: Status
  playerHp: number
  maxPlayerHp: number
  playerLane: Lane
  guardMs: number
  enemyHp: number
  maxEnemyHp: number
  enemyLane: Lane
  enemyDistance: Distance
  warning?: Warning
  effects: BattleEffect[]
  nextEventMs: number
  turn: number
  rewardApplied: boolean
  playerFlashMs: number
  enemyFlashMs: number
}

type BattleAction =
  | { type: 'tick'; dt: number }
  | { type: 'command'; command: string; availableCommands: string[] }
  | { type: 'mark-reward-applied' }

const laneLabels = ['ひだり', 'まんなか', 'みぎ'] as const
const fixedCommands = ['left', 'right', 'guard']

const commandMeta: Record<
  string,
  {
    title: string
    desc: string
    emoji: string
    icon: IconKind
    tone: 'move' | 'guard' | 'attack' | 'magic'
    powerText?: string
    rangeText?: string
  }
> = {
  left: { title: 'left', desc: 'ひだりへ 1マス', emoji: '⬅️', icon: 'left', tone: 'move' },
  right: { title: 'right', desc: 'みぎへ 1マス', emoji: '➡️', icon: 'right', tone: 'move' },
  guard: { title: 'guard', desc: 'つぎの 1げきを まもる', emoji: '🛡️', icon: 'guard', tone: 'guard' },
  hit: { title: 'hit', desc: 'ちかくを たたく', emoji: '🗡️', icon: 'slash', tone: 'attack', powerText: '威力 12', rangeText: '射程 目の前1マス' },
  shot: { title: 'shot', desc: 'まっすぐ うつ', emoji: '🏹', icon: 'shot', tone: 'attack', powerText: '威力 14', rangeText: '射程 一直線に2マス' },
  slash: { title: 'slash', desc: 'つよく きる', emoji: '⚔️', icon: 'slash', tone: 'attack', powerText: '威力 22', rangeText: '射程 一直線に1マス' },
  powershot: { title: 'powershot', desc: 'つよい や', emoji: '🎯', icon: 'shot', tone: 'attack', powerText: '威力 22', rangeText: '射程 一直線に3マス' },
  fire: { title: 'fire', desc: 'ほのお', emoji: '🔥', icon: 'fire', tone: 'magic', powerText: '威力 16', rangeText: '射程 一直線に2マス' },
  fireball: { title: 'fireball', desc: 'おおきな ほのお', emoji: '☄️', icon: 'fire', tone: 'magic', powerText: '威力 26', rangeText: '射程 一直線に3マス' },
}

const navItems = [
  { screen: 'home' as const, label: 'ホーム', emoji: '🏠' },
  { screen: 'missions' as const, label: 'ミッション', emoji: '🗺️' },
  { screen: 'growth' as const, label: '育成', emoji: '🌱' },
]

const missions: Mission[] = [
  {
    id: 'meadow',
    name: 'ひだまり草原',
    description: 'いちばん やさしい',
    strength: '★',
    rewardText: 'EXP 100',
    rewardExp: 100,
    enemyHp: 40,
    actionDelayMs: 15000,
    warningMs: {
      move: 3200,
      attack: 3200,
    },
  },
  {
    id: 'river',
    name: 'あおぞらの川',
    description: 'すこし はやい',
    strength: '★★',
    rewardText: 'EXP 130',
    rewardExp: 130,
    enemyHp: 54,
    actionDelayMs: 12000,
    warningMs: {
      move: 2800,
      attack: 2800,
    },
  },
  {
    id: 'tower',
    name: 'おかしの塔',
    description: 'かなり はやい',
    strength: '★★★',
    rewardText: 'EXP 170',
    rewardExp: 170,
    enemyHp: 68,
    actionDelayMs: 9000,
    warningMs: {
      move: 2400,
      attack: 2400,
    },
  },
]

const skills: Skill[] = [
  { command: 'slash', label: 'slash', cost: 1, prereq: 'hit', description: 'つよい ちかこうげき' },
  { command: 'powershot', label: 'powershot', cost: 1, prereq: 'shot', description: 'つよい とおきょり' },
  { command: 'fire', label: 'fire', cost: 1, prereq: 'shot', description: 'ほのお こうげき' },
  { command: 'fireball', label: 'fireball', cost: 2, prereq: 'fire', description: 'おおきな ほのお' },
]

const initialProfile: ProfileState = {
  level: 1,
  exp: 0,
  expToNext: 100,
  skillPoints: 0,
  learned: ['hit', 'shot'],
  equipped: ['hit', 'shot'],
  missionWins: [],
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

function createBattleState(mission: Mission, profile: ProfileState): BattleState {
  const baseState: BattleState = {
    mission,
    status: 'playing',
    playerHp: 100,
    maxPlayerHp: 100,
    playerLane: 1,
    guardMs: 0,
    enemyHp: mission.enemyHp,
    maxEnemyHp: mission.enemyHp,
    enemyLane: 1,
    enemyDistance: 'mid',
    warning: undefined,
    effects: [],
    nextEventMs: 0,
    turn: 0,
    rewardApplied: false,
    playerFlashMs: 0,
    enemyFlashMs: 0,
  }

  return scheduleEnemyWarning(baseState, profile)
}

function applyMissionReward(profile: ProfileState, mission: Mission): ProfileState {
  let exp = profile.exp + mission.rewardExp
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
    missionWins: profile.missionWins.includes(mission.id) ? profile.missionWins : [...profile.missionWins, mission.id],
  }
}

function buildEnemyWarning(state: BattleState, profile: ProfileState, turn: number, duration: number, phase: 'preview' | 'active' = 'preview'): Warning {
  const id = Date.now() + turn
  const sameLane = state.enemyLane === state.playerLane
  const moveCycle: Distance[] = ['near', 'mid', 'far', 'mid']
  const nextMoveDistance = moveCycle[((turn - 1) / 2) % moveCycle.length]

  if (profile.learned.includes('fire') && turn % 9 === 0 && state.enemyDistance === 'far') {
    return {
      id,
      type: 'weak',
      phase,
      icon: 'fire',
      label: '🔥',
      lane: state.enemyLane,
      duration,
      timeLeft: duration,
      damage: 0,
      guardable: false,
      weakness: 'fire',
    }
  }

  if (!sameLane) {
    return {
      id,
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
    const movingCloser = distanceRank(nextMoveDistance) < distanceRank(state.enemyDistance)
    return {
      id,
      type: movingCloser ? 'move-near' : 'move-far',
      phase,
      icon: movingCloser ? 'down' : 'up',
      label: movingCloser ? '⬇️' : '⬆️',
      lane: state.enemyLane,
      duration,
      timeLeft: duration,
      damage: 0,
      guardable: false,
      nextDistance: nextMoveDistance,
    }
  }

  if (state.enemyDistance !== 'near') {
    return {
      id,
      type: 'ranged',
      phase,
      icon: 'shot',
      label: '🏹',
      lane: state.enemyLane,
      duration,
      timeLeft: duration,
      damage: 10,
      guardable: true,
    }
  }

  return {
    id,
    type: turn % 6 === 0 ? 'unblockable' : 'melee',
    phase,
    icon: turn % 6 === 0 ? 'danger' : 'slash',
    label: turn % 6 === 0 ? '❗' : '⚔️',
    lane: state.enemyLane,
    duration,
    timeLeft: duration,
    damage: turn % 6 === 0 ? 16 : 12,
    guardable: turn % 6 !== 0,
  }
}

function scheduleEnemyWarning(state: BattleState, profile: ProfileState): BattleState {
  if (state.status !== 'playing') return { ...state, warning: undefined }

  const turn = state.turn + 1
  return {
    ...state,
    turn,
    nextEventMs: 0,
    warning: buildEnemyWarning(state, profile, turn, state.mission.actionDelayMs),
  }
}

function createEnemyEffect(state: BattleState, warning: Warning): BattleEffect | null {
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
      fromTrack: state.enemyDistance,
      toTrack: 'player',
      duration: 1000,
      elapsed: 0,
      damage: warning.damage,
      guardable: true,
    }
  }

  return {
    id,
    owner: 'enemy',
    type: 'enemy-dash',
    icon: warning.type === 'unblockable' ? 'danger' : 'slash',
    lane: warning.lane,
    fromTrack: state.enemyDistance,
    toTrack: 'player',
    duration: 760,
    elapsed: 0,
    damage: warning.damage,
    guardable: warning.guardable,
  }
}

function createPlayerEffect(state: BattleState, command: string): BattleEffect | null {
  const id = Date.now() + Math.random()
  const lane = state.playerLane
  const enemyInLine = state.playerLane === state.enemyLane
  const buildTargetTrack = (range: number) =>
    enemyInLine && distanceRank(state.enemyDistance) <= range ? state.enemyDistance : trackForRange(range)

  if (command === 'hit' || command === 'slash') {
    return {
      id,
      owner: 'player',
      type: 'player-hit',
      icon: 'slash',
      lane,
      fromTrack: 'player',
      toTrack: buildTargetTrack(1),
      duration: 560,
      elapsed: 0,
      damage: command === 'slash' ? 22 : 12,
      guardable: false,
      powerLabel: command === 'slash' ? '威力 22' : '威力 12',
      rangeLabel: command === 'slash' ? '一直線に1マス' : '目の前1マス',
    }
  }

  if (command === 'shot' || command === 'powershot') {
    const range = command === 'powershot' ? 3 : 2
    return {
      id,
      owner: 'player',
      type: 'player-shot',
      icon: 'bolt',
      lane,
      fromTrack: 'player',
      toTrack: buildTargetTrack(range),
      duration: 900,
      elapsed: 0,
      damage: command === 'powershot' ? 22 : 14,
      guardable: false,
      powerLabel: command === 'powershot' ? '威力 22' : '威力 14',
      rangeLabel: command === 'powershot' ? '一直線に3マスまで' : '一直線に2マスまで',
    }
  }

  if (command === 'fire' || command === 'fireball') {
    const range = command === 'fireball' ? 3 : 2
    return {
      id,
      owner: 'player',
      type: 'player-fire',
      icon: 'fire',
      lane,
      fromTrack: 'player',
      toTrack: buildTargetTrack(range),
      duration: 980,
      elapsed: 0,
      damage: command === 'fireball' ? 26 : 16,
      guardable: false,
      weakness: 'fire',
      powerLabel: command === 'fireball' ? '威力 26' : '威力 16',
      rangeLabel: command === 'fireball' ? '3マス先まで' : '2マス先まで',
    }
  }

  return null
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
      warning: playerHp <= 0 ? undefined : state.warning,
      playerFlashMs: damage > 0 ? 260 : state.playerFlashMs,
    }
  }

  if (effect.lane !== state.enemyLane || effect.toTrack !== state.enemyDistance) {
    return state
  }

  const weaknessBonus = state.warning?.type === 'weak' && state.warning.phase === 'active' && effect.weakness === 'fire' ? 16 : 0
  const enemyHp = Math.max(0, state.enemyHp - effect.damage - weaknessBonus)

  return {
    ...state,
    status: enemyHp <= 0 ? 'cleared' : state.status,
    enemyHp,
    enemyFlashMs: 260,
    warning: enemyHp <= 0 || (state.warning?.type === 'weak' && state.warning.phase === 'active' && effect.weakness === 'fire') ? undefined : state.warning,
    nextEventMs: enemyHp <= 0 ? 0 : state.nextEventMs,
  }
}

function tickBattle(state: BattleState, profile: ProfileState, dt: number): BattleState {
  if (state.status !== 'playing') return state

  let nextState: BattleState = {
    ...state,
    guardMs: Math.max(0, state.guardMs - dt),
    playerFlashMs: Math.max(0, state.playerFlashMs - dt),
    enemyFlashMs: Math.max(0, state.enemyFlashMs - dt),
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

  if (nextState.warning) {
    const timeLeft = nextState.warning.timeLeft - dt
    if (timeLeft > 0) {
      nextState = {
        ...nextState,
        warning: {
          ...nextState.warning,
          timeLeft,
        },
      }
    } else {
      const warning = nextState.warning

      if (warning.type === 'weak' && warning.phase === 'preview') {
        nextState = {
          ...nextState,
          warning: {
            ...warning,
            phase: 'active',
            duration: nextState.mission.warningMs.attack,
            timeLeft: nextState.mission.warningMs.attack,
          },
        }
      } else if (warning.type === 'weak') {
        nextState = scheduleEnemyWarning({ ...nextState, warning: undefined }, profile)
      } else if (warning.type === 'move-lane') {
        nextState = scheduleEnemyWarning(
          {
            ...nextState,
            enemyLane: warning.nextLane ?? nextState.enemyLane,
            warning: undefined,
          },
          profile,
        )
      } else if (warning.type === 'move-near' || warning.type === 'move-far') {
        nextState = scheduleEnemyWarning(
          {
            ...nextState,
            enemyDistance: warning.nextDistance ?? nextState.enemyDistance,
            warning: undefined,
          },
          profile,
        )
      } else {
        const effect = createEnemyEffect(nextState, warning)
        nextState = scheduleEnemyWarning(
          {
            ...nextState,
            warning: undefined,
            effects: effect ? [...nextState.effects, effect] : nextState.effects,
          },
          profile,
        )
      }
    }
  }

  return nextState
}

function runBattleCommand(state: BattleState, command: string, availableCommands: string[]): BattleState {
  if (state.status !== 'playing') return state
  const normalized = command.trim().toLowerCase()
  if (!normalized || !availableCommands.includes(normalized)) return state

  if (normalized === 'left' || normalized === 'right') {
    const delta = normalized === 'left' ? -1 : 1
    return {
      ...state,
      playerLane: clampLane(state.playerLane + delta),
    }
  }

  if (normalized === 'guard') {
    return {
      ...state,
      guardMs: 1700,
    }
  }

  const effect = createPlayerEffect(state, normalized)
  if (!effect) return state

  return {
    ...state,
    effects: [...state.effects, effect],
  }
}

function battleReducer(state: BattleState, action: BattleAction, profile: ProfileState): BattleState {
  switch (action.type) {
    case 'tick':
      return tickBattle(state, profile, action.dt)
    case 'command':
      return runBattleCommand(state, action.command, action.availableCommands)
    case 'mark-reward-applied':
      return { ...state, rewardApplied: true }
    default:
      return state
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [profile, setProfile] = useState<ProfileState>(initialProfile)
  const [battle, setBattle] = useState<BattleState | null>(null)
  const [loadingMission, setLoadingMission] = useState<Mission | null>(null)
  const [commandText, setCommandText] = useState('')
  const commandInputRef = useRef<HTMLInputElement>(null)

  const availableCommands = useMemo(() => [...fixedCommands, ...profile.equipped], [profile.equipped])

  useEffect(() => {
    if (screen !== 'battle') return
    const timer = window.setInterval(() => {
      setBattle((current) => {
        if (!current) return current
        return battleReducer(current, { type: 'tick', dt: 60 }, profile)
      })
    }, 60)

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
      setBattle(createBattleState(loadingMission, profile))
      setScreen('battle')
    }, 2400)

    return () => window.clearTimeout(handle)
  }, [loadingMission, profile, screen])

  useEffect(() => {
    if (!battle || battle.status !== 'cleared' || battle.rewardApplied) return

    const mission = battle.mission
    const handle = window.setTimeout(() => {
      setProfile((current) => applyMissionReward(current, mission))
      setBattle((current) => (current ? battleReducer(current, { type: 'mark-reward-applied' }, profile) : current))
    }, 0)

    return () => window.clearTimeout(handle)
  }, [battle, profile])

  function startMission(mission: Mission) {
    setLoadingMission(mission)
    setBattle(null)
    setCommandText('')
    setScreen('loading')
  }

  function submitBattleCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBattle((current) => (current ? battleReducer(current, { type: 'command', command: commandText, availableCommands }, profile) : current))
    setCommandText('')
  }

  function tapBattleCommand(command: string) {
    setBattle((current) => (current ? battleReducer(current, { type: 'command', command, availableCommands }, profile) : current))
    setCommandText('')
  }

  function learnSkill(skill: Skill) {
    if (profile.learned.includes(skill.command)) return
    if (profile.skillPoints < skill.cost) return
    if (skill.prereq && !profile.learned.includes(skill.prereq)) return

    setProfile((current) => ({
      ...current,
      skillPoints: current.skillPoints - skill.cost,
      learned: [...current.learned, skill.command],
      equipped: current.equipped.length < 4 ? [...current.equipped, skill.command] : current.equipped,
    }))
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

  return (
    <main className="app-shell">
      <header className={`app-header ${screen === 'home' ? '' : 'compact'}`}>
        <div className="header-copy">
          {screen === 'home' ? (
            <div className="brand-lockup">
              <span className="brand-icon" aria-hidden="true">
                ⚔️
              </span>
              <div>
                <span className="mini-label">えいたんご バトルRPG</span>
                <h1 className="brand-title">タイピングレーンRPG</h1>
              </div>
            </div>
          ) : (
            <>
              <span className="mini-label">タイピングレーンRPG</span>
              <p className="header-title">タイピングレーンRPG</p>
            </>
          )}
        </div>

        <nav className="top-nav" aria-label="main navigation">
          {navItems.map((item) => (
            <button
              key={item.screen}
              type="button"
              className={screen === item.screen ? 'active' : ''}
              aria-label={item.label}
              title={item.label}
              onClick={() => setScreen(item.screen)}
            >
              <span aria-hidden="true">{item.emoji}</span>
            </button>
          ))}
        </nav>
      </header>

      {screen === 'home' && (
        <section className="page-shell">
          <section className="home-hub">
            <section className="hero-panel home-hero">
              <div className="hero-copy">
                <span className="mini-label">ホーム</span>
                <div className="home-progress-card">
                  <div className="home-progress-head">
                    <div className="home-level-pill">Lv {profile.level}</div>
                    <div className="home-sp-pill">SP {profile.skillPoints}</div>
                  </div>
                  <div className="home-exp-panel">
                    <div className="home-exp-copy">
                      <strong>EXP</strong>
                      <span>
                        {profile.exp} / {profile.expToNext}
                      </span>
                    </div>
                    <div className="home-exp-bar" aria-label="EXP">
                      <i style={{ width: `${(profile.exp / profile.expToNext) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="home-entry-grid">
                <button type="button" className="home-entry primary" onClick={() => setScreen('missions')}>
                  <span className="home-entry-icon" aria-hidden="true">
                    🗺️
                  </span>
                  <strong>ミッション</strong>
                  <span>ステージを えらんで たたかう</span>
                </button>

                <button type="button" className="home-entry" onClick={() => setScreen('growth')}>
                  <span className="home-entry-icon" aria-hidden="true">
                    🌱
                  </span>
                  <strong>育成</strong>
                  <span>ことばを おぼえて そうびする</span>
                </button>
              </div>
            </section>

            <section className="section-card rule-card">
              <div className="section-heading">
                <div>
                  <span className="mini-label">あそびかた</span>
                  <h2>3つだけ おぼえる</h2>
                </div>
              </div>

              <div className="rule-list">
                <div className="rule-step">
                  <span className="rule-step-icon" aria-hidden="true">
                    👀
                  </span>
                  <div>
                    <strong>1. てきの マークを みる</strong>
                    <p>うごくのか こうげきするのかを みる</p>
                  </div>
                </div>
                <div className="rule-step">
                  <span className="rule-step-icon" aria-hidden="true">
                    ⌨️
                  </span>
                  <div>
                    <strong>2. ことばを うつ</strong>
                    <p>left right guard hit shot を つかう</p>
                  </div>
                </div>
                <div className="rule-step">
                  <span className="rule-step-icon" aria-hidden="true">
                    🏃
                  </span>
                  <div>
                    <strong>3. よけるか まもる</strong>
                    <p>こうげきの ばしょから ずれる</p>
                  </div>
                </div>
              </div>
            </section>
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
              {missions.map((mission) => (
                <article key={mission.id} className="mission-card">
                  <strong>{mission.name}</strong>
                  <p>{mission.description}</p>
                  <p>つよさ {mission.strength}</p>
                  <p>{mission.rewardText}</p>
                  <button type="button" onClick={() => startMission(mission)}>
                    ちょうせん
                  </button>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {screen === 'growth' && (
        <section className="page-shell growth-grid">
          <section className="section-card">
            <span className="mini-label">そうび</span>
            <h2>そうびする コマンド</h2>
            <p className="section-note">
              そうびした コマンドだけ <ruby>技<rt>わざ</rt></ruby>が <ruby>発動<rt>はつどう</rt></ruby>します
            </p>
            <div className="equip-slots">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`slot-${index}`} className="equip-slot">
                  <span>{index + 1}</span>
                  <strong>{profile.equipped[index] ?? 'なし'}</strong>
                </div>
              ))}
            </div>
            <div className="skill-grid">
              {[...new Set(['hit', 'shot', ...profile.learned.filter((command) => !['hit', 'shot'].includes(command))])].map((command) => {
                const meta = commandMeta[command]
                const equipped = profile.equipped.includes(command)
                return (
                  <button key={command} type="button" className={`skill-card ${equipped ? 'equipped' : ''}`} onClick={() => toggleEquip(command)}>
                    <span className={`skill-icon ${meta?.tone ?? 'attack'}`}>{meta?.emoji ?? '✨'}</span>
                    <strong>{command}</strong>
                    <span>{meta?.desc ?? ''}</span>
                    {meta?.powerText ? <span>{meta.powerText}</span> : null}
                    {meta?.rangeText ? <span>{meta.rangeText}</span> : null}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="section-card">
            <span className="mini-label">おぼえる</span>
            <h2>SP を つかってコマンドを おぼえる</h2>
            <p className="section-note">レベルが 1 あがるごとに 1 SP かくとく</p>
            <p className="section-note">SP {profile.skillPoints}</p>
            <div className="skill-grid">
              {skills.map((skill) => {
                const learned = profile.learned.includes(skill.command)
                const locked = Boolean(skill.prereq && !profile.learned.includes(skill.prereq))
                const affordable = profile.skillPoints >= skill.cost
                const meta = commandMeta[skill.command]

                return (
                  <button
                    key={skill.command}
                    type="button"
                    className={`skill-card ${learned ? 'learned' : ''}`}
                    disabled={learned || locked || !affordable}
                    onClick={() => learnSkill(skill)}
                  >
                    <span className={`skill-icon ${meta?.tone ?? 'attack'}`}>{meta?.emoji ?? '✨'}</span>
                    <strong>{skill.label}</strong>
                    {meta?.powerText ? <span>{meta.powerText}</span> : null}
                    {meta?.rangeText ? <span>{meta.rangeText}</span> : null}
                    <span>{learned ? 'おぼえた' : locked ? `${skill.prereq} がひつよう` : `${skill.cost} SP`}</span>
                  </button>
                )
              })}
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
                        <BoardCell key={`${track}-${lane}`} highlight={getCellHighlight(battle.warning, battle.enemyLane, battle.enemyDistance, track, lane)} playerRow={false} />
                      ))}
                    </div>
                  ))}

                  <div className="gap-row">
                    <div className="gap-banner">ここだけ うごける</div>
                  </div>

                  <div className="grid-row">
                    {([0, 1, 2] as Lane[]).map((lane) => (
                      <BoardCell key={`player-${lane}`} highlight={getCellHighlight(battle.warning, battle.enemyLane, battle.enemyDistance, 'player', lane)} playerRow />
                    ))}
                  </div>
                </div>

                <div className="actor-layer">
                  <ActorToken
                    kind="enemy"
                    lane={battle.enemyLane}
                    track={battle.enemyDistance}
                    hpPercent={battle.enemyHp / battle.maxEnemyHp}
                    hpText={`${battle.enemyHp}/${battle.maxEnemyHp}`}
                    warning={battle.warning}
                    flash={battle.enemyFlashMs > 0}
                  />
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
                  <CommandButton key={command} command={command} onClick={() => tapBattleCommand(command)} />
                ))}
              </div>
            </section>
          </section>

          {battle.status !== 'playing' && (
            <div className="result-panel" role="status">
              <strong>{battle.status === 'cleared' ? 'クリア' : 'ゲームオーバー'}</strong>
              <span>{battle.status === 'cleared' ? battle.mission.rewardText : 'もういちど やってみよう'}</span>
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
          )}
        </section>
      )}

    </main>
  )
}

function getCellHighlight(
  warning: BattleState['warning'],
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

function CommandButton({ command, onClick }: { command: string; onClick: () => void }) {
  const meta = commandMeta[command]
  return (
    <button type="button" className={`command-button ${meta?.tone ?? 'attack'}`} onClick={onClick}>
      <span className="command-button-icon">{meta?.emoji ?? '✨'}</span>
      <span className="command-button-copy">
        <strong>{meta?.title ?? command}</strong>
        <small>{meta?.desc ?? ''}</small>
        {meta?.powerText ? <small>{meta.powerText}</small> : null}
        {meta?.rangeText ? <small>{meta.rangeText}</small> : null}
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
  const style = {
    left: `${lanePercent(effect.lane)}%`,
    top: `${startTop + (endTop - startTop) * progress}%`,
  }

  return (
    <div className={`effect-sprite ${effect.owner} ${effect.type}`} style={style}>
      <span className="emoji-icon">{iconEmoji(effect.icon)}</span>
    </div>
  )
}

function PlayerSprite({ guarding }: { guarding: boolean }) {
  return <div className={`sprite player-sprite ${guarding ? 'guarding' : ''}`} aria-label="player">🧍</div>
}

function EnemySprite({ weak }: { weak: boolean }) {
  return <div className={`sprite enemy-sprite ${weak ? 'weak' : ''}`} aria-label="enemy">👾</div>
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
    default:
      return '•'
  }
}

export default App
