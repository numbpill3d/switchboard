/* Theme tokens. Each theme = UI chrome vars + xterm palette.
 * State colors are green/yellow/red/grey per the spec but tuned per theme. */
window.SB_THEMES = {
  classic: {
    label: 'Classic (B/W)',
    ui: {
      '--bg':'#ffffff', '--fg':'#000000', '--chrome':'#ffffff', '--line':'#000000',
      '--desk':'#a5a5a5', '--accent':'#000000', '--accent-fg':'#ffffff',
      '--muted':'#808080', '--sunken':'#ffffff', '--shadow':'#000000',
      '--titlelines':'#000000', '--tab-bg':'#ffffff', '--tab-active':'#000000',
      '--tab-active-fg':'#ffffff', '--st-green':'#1a7f1a', '--st-yellow':'#b8860b',
      '--st-red':'#c40000', '--st-grey':'#8a8a8a', '--pattern':'#000000'
    },
    term: { background:'#ffffff', foreground:'#000000', cursor:'#000000', cursorAccent:'#ffffff',
      selectionBackground:'#000000', selectionForeground:'#ffffff',
      black:'#000000', red:'#a00000', green:'#006000', yellow:'#805000', blue:'#000080',
      magenta:'#800080', cyan:'#008080', white:'#c0c0c0',
      brightBlack:'#606060', brightRed:'#d00000', brightGreen:'#008000', brightYellow:'#a06000',
      brightBlue:'#0000d0', brightMagenta:'#a000a0', brightCyan:'#00a0a0', brightWhite:'#000000' }
  },
  platinum: {
    label: 'Platinum (Grey)',
    ui: {
      '--bg':'#e8e8e8', '--fg':'#1a1a1a', '--chrome':'#dcdcdc', '--line':'#3a3a3a',
      '--desk':'#7c7c85', '--accent':'#33447a', '--accent-fg':'#ffffff',
      '--muted':'#777', '--sunken':'#f4f4f4', '--shadow':'#5a5a5a',
      '--titlelines':'#8a8a95', '--tab-bg':'#d0d0d0', '--tab-active':'#33447a',
      '--tab-active-fg':'#ffffff', '--st-green':'#1f8a3b', '--st-yellow':'#c88a00',
      '--st-red':'#c62828', '--st-grey':'#9a9aa2', '--pattern':'#b7b7c0'
    },
    term: { background:'#f4f4f4', foreground:'#1a1a1a', cursor:'#33447a', cursorAccent:'#ffffff',
      selectionBackground:'#b9c2e8',
      black:'#2b2b2b', red:'#b02020', green:'#1f7a35', yellow:'#a06a00', blue:'#33447a',
      magenta:'#7a3a7a', cyan:'#2a7a7a', white:'#d8d8d8',
      brightBlack:'#6a6a6a', brightRed:'#d43030', brightGreen:'#2a9a45', brightYellow:'#c88a00',
      brightBlue:'#4a5aa0', brightMagenta:'#9a4a9a', brightCyan:'#3a9a9a', brightWhite:'#111111' }
  },
  phosphor: {
    label: 'Phosphor (Green CRT)',
    ui: {
      '--bg':'#001a00', '--fg':'#33ff66', '--chrome':'#002200', '--line':'#33ff66',
      '--desk':'#001000', '--accent':'#33ff66', '--accent-fg':'#001a00',
      '--muted':'#1f8f3f', '--sunken':'#001500', '--shadow':'#0a3f0a',
      '--titlelines':'#1f8f3f', '--tab-bg':'#002200', '--tab-active':'#33ff66',
      '--tab-active-fg':'#001a00', '--st-green':'#4dff7a', '--st-yellow':'#e6e600',
      '--st-red':'#ff5050', '--st-grey':'#1f6f3f', '--pattern':'#0d5c26'
    },
    term: { background:'#001500', foreground:'#33ff66', cursor:'#33ff66', cursorAccent:'#001500',
      selectionBackground:'#0d5c26',
      black:'#0a2a0a', red:'#ff6666', green:'#33ff66', yellow:'#e6e600', blue:'#33ccff',
      magenta:'#cc66ff', cyan:'#33ffcc', white:'#aaffbb',
      brightBlack:'#1f6f3f', brightRed:'#ff8888', brightGreen:'#66ff99', brightYellow:'#ffff66',
      brightBlue:'#66ddff', brightMagenta:'#dd88ff', brightCyan:'#66ffdd', brightWhite:'#ccffcc' }
  },
  amber: {
    label: 'Amber (CRT)',
    ui: {
      '--bg':'#1a0f00', '--fg':'#ffb000', '--chrome':'#241500', '--line':'#ffb000',
      '--desk':'#120a00', '--accent':'#ffb000', '--accent-fg':'#1a0f00',
      '--muted':'#a06a00', '--sunken':'#150c00', '--shadow':'#4a2f00',
      '--titlelines':'#a06a00', '--tab-bg':'#241500', '--tab-active':'#ffb000',
      '--tab-active-fg':'#1a0f00', '--st-green':'#9ad600', '--st-yellow':'#ffd24d',
      '--st-red':'#ff5a3c', '--st-grey':'#8a5f14', '--pattern':'#5c3d00'
    },
    term: { background:'#150c00', foreground:'#ffb000', cursor:'#ffb000', cursorAccent:'#150c00',
      selectionBackground:'#5c3d00',
      black:'#2a1a00', red:'#ff6a3c', green:'#9ad600', yellow:'#ffd24d', blue:'#ffcf80',
      magenta:'#ff9a4d', cyan:'#ffc266', white:'#ffdca0',
      brightBlack:'#8a5f14', brightRed:'#ff8a5c', brightGreen:'#b6f000', brightYellow:'#ffe27a',
      brightBlue:'#ffe0a0', brightMagenta:'#ffb066', brightCyan:'#ffd280', brightWhite:'#fff0d0' }
  },
  midnight: {
    label: 'Midnight (Dark)',
    ui: {
      '--bg':'#1b1d21', '--fg':'#e6e6e6', '--chrome':'#26282d', '--line':'#000000',
      '--desk':'#0d0e10', '--accent':'#e6e6e6', '--accent-fg':'#1b1d21',
      '--muted':'#8a8d93', '--sunken':'#141519', '--shadow':'#000000',
      '--titlelines':'#3a3d44', '--tab-bg':'#2b2e34', '--tab-active':'#e6e6e6',
      '--tab-active-fg':'#1b1d21', '--st-green':'#4cd964', '--st-yellow':'#ffcc00',
      '--st-red':'#ff453a', '--st-grey':'#6a6d73', '--pattern':'#3a3d44'
    },
    term: { background:'#141519', foreground:'#e6e6e6', cursor:'#e6e6e6', cursorAccent:'#141519',
      selectionBackground:'#3a3d55',
      black:'#2b2e34', red:'#ff6b6b', green:'#4cd964', yellow:'#ffcc00', blue:'#5aa9ff',
      magenta:'#c58aff', cyan:'#4cd9d9', white:'#c8c8c8',
      brightBlack:'#6a6d73', brightRed:'#ff8a8a', brightGreen:'#7ee89a', brightYellow:'#ffdd55',
      brightBlue:'#82c0ff', brightMagenta:'#d6aaff', brightCyan:'#7ee8e8', brightWhite:'#ffffff' }
  }
};
