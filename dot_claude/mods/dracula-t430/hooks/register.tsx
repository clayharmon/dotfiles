import type { Register, ThemeSetArgs, ThemeSound, ThemeStyle } from 'claude-code'

import { makeColors } from './make-colors.js'

const BG = '#1e1f28'
const BG_DARK = '#191a21'
const PANEL = '#282a36'
const LINE = '#44475a'
const FG = '#f8f8f2'
const COMMENT = '#8f9bc9'
const RED = '#ff5555'
const GREEN = '#50fa7b'
const YELLOW = '#f0fa8b'
const PURPLE = '#bd92f8'
const PINK = '#ff78c5'
const CYAN = '#8ae9fc'
const ORANGE = '#ffb86c'

const { theme, problems } = makeColors({
  label: 'Dracula T430',
  only: 'dark',
  roles: { accent: PURPLE, danger: RED, success: GREEN, warning: YELLOW, pro: PINK },
  dark: {
    gray: {
      anchors: {
        'surface-0': BG,
        'surface-1': '#22232e',
        'surface-2': PANEL,
        'surface-3': '#2a2c39',
        'text-primary': FG,
        'text-secondary': '#c5c8d6',
        'text-muted': COMMENT,
      },
    },
    git: {
      added: GREEN,
      removed: RED,
      modified: ORANGE,
      merged: PURPLE,
      closed: RED,
      conflicting: ORANGE,
      draft: COMMENT,
    },
  },
  codeTheme: { dark: 'dracula' },
  contrast: 'more',
})

const FETCH: readonly (readonly [string, string])[] = [
  ['os', 'arch linux (btw)'],
  ['host', 'thinkpad t430'],
  ['bios', 'coreboot + seabios'],
  ['kbd', 'x220 classic, 7 row'],
  ['wm', 'aerospace'],
  ['term', 'kitty + herdr'],
  ['shell', 'fish'],
  ['editor', 'nvim'],
]

const SWATCHES = [RED, GREEN, YELLOW, PURPLE, PINK, CYAN, FG]

const fetchRows = FETCH.map(
  ([key, value], i) =>
    `<text x="0" y="${64 + i * 22}"><tspan fill="${PURPLE}">${key}</tspan><tspan x="84" fill="${FG}">${value}</tspan></text>`,
).join('')

const swatchRow = SWATCHES.map(
  (color, i) => `<rect x="${i * 26}" y="${64 + FETCH.length * 22}" width="22" height="12" fill="${color}"/>`,
).join('')

const promptY = 64 + FETCH.length * 22 + 44

const SCENE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
<style>
.cur { animation: blink 1s steps(1, end) infinite; }
@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }
text { font-family: monospace; font-size: 15px; }
</style>
<defs>
<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse">
<rect width="4" height="3" fill="${BG}"/>
<rect y="3" width="4" height="1" fill="${BG_DARK}"/>
</pattern>
<radialGradient id="vig" cx="50%" cy="45%" r="75%">
<stop offset="60%" stop-color="${BG_DARK}" stop-opacity="0"/>
<stop offset="100%" stop-color="#0d0e13" stop-opacity="0.7"/>
</radialGradient>
</defs>
<rect width="1600" height="1000" fill="url(#scan)"/>
<rect width="1600" height="1000" fill="url(#vig)"/>
<svg x="0" y="0" width="1600" height="1000" viewBox="0 0 300 330" preserveAspectRatio="xMaxYMin meet" opacity="0.4">
<g transform="translate(12 16) scale(0.62)">
<text x="0" y="20"><tspan fill="${CYAN}" font-weight="bold">user</tspan><tspan fill="${FG}">@</tspan><tspan fill="${PINK}" font-weight="bold">t430</tspan></text>
<rect x="0" y="32" width="230" height="1" fill="${LINE}"/>
${fetchRows}
${swatchRow}
<text x="0" y="${promptY}"><tspan fill="${CYAN}" font-weight="bold">~</tspan><tspan fill="${GREEN}"> $</tspan></text>
<rect class="cur" x="34" y="${promptY - 13}" width="9" height="16" fill="#bbbbbb" opacity="1"/>
</g>
</svg>
</svg>`

const SOUND: ThemeSound = {
  ambience: {
    layers: [
      { wave: 'brown', drone: true, gain: 0.12, filter: { type: 'lowpass', hz: 420 } },
      { wave: 'pink', drone: true, gain: 0.04, filter: { type: 'bandpass', hz: 1800 }, tremolo: { hz: 0.1, depth: 0.3 } },
    ],
  },
  cues: {
    send: {
      layers: [
        { wave: 'white', gain: 0.35, attack: 0.002, release: 0.03, filter: { type: 'bandpass', hz: 2400 } },
        { wave: 'brown', gain: 0.5, attack: 0.002, release: 0.06 },
      ],
    },
    tool: { layers: [{ wave: 'white', gain: 0.12, attack: 0.002, release: 0.02, filter: { type: 'bandpass', hz: 3200 } }] },
    done: { layers: [{ wave: 'square', notes: [880], gain: 0.12, attack: 0.002, release: 0.12, filter: { type: 'lowpass', hz: 2400 } }] },
    ask: { layers: [{ wave: 'square', notes: [660, 880], step: 0.09, gain: 0.12, attack: 0.002, release: 0.08, filter: { type: 'lowpass', hz: 2400 } }] },
    error: { layers: [{ wave: 'square', notes: [220, 220], step: 0.16, gain: 0.14, attack: 0.002, release: 0.12, filter: { type: 'lowpass', hz: 1200 } }] },
  },
}

const STYLE: ThemeStyle = {
  Text: { fontFamily: ['mono'], fontSize: 14, lineHeight: 22 },
  Heading: { fontFamily: ['mono'], fontWeight: 'bold', color: PINK },
  UserMessage: {
    color: FG,
    backgroundColor: PANEL,
    borderColor: PURPLE,
    borderWidth: 2,
    radius: 0,
    paddingX: 14,
    paddingY: 10,
    shadow: { x: 4, y: 4, blur: 0, color: '#0d0e13' },
  },
  ToolUse: {
    fontFamily: ['mono'],
    color: CYAN,
    backgroundColor: '#21222c',
    borderColor: LINE,
    borderWidth: 1,
    radius: 0,
    paddingX: 8,
  },
}

const BASE: ThemeSetArgs = {
  colors: theme,
  overrideColorScheme: 'dark',
  backdrop: { scene: 'fetch', glass: { blur: 20, tint: BG, opacity: 0.8 } },
}

const ATTEMPTS: readonly ThemeSetArgs[] = [{ ...BASE, style: STYLE, sound: SOUND }, { ...BASE, style: STYLE }, BASE]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }

    for (const look of ATTEMPTS) {
      try {
        await $.theme.set(look)
        break
      } catch (error) {
        $.ui.log(String(error))
      }
    }

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt="Scanlines and a system readout with a blinking cursor" isInteractive />
  })
}
