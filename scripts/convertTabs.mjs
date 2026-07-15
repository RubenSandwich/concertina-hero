#!/usr/bin/env node

const { parseArgs } = require('node:util')

function convertKalimbaToAccordion(kalimbaStr) {
  const noteMap = {
    // Lower Octave
    1: '+1',
    C: '+1',
    2: '-1',
    D: '-1',
    3: '+2',
    E: '+2',
    4: '-2',
    F: '-2',
    5: '+3',
    G: '+3',
    6: '-3',
    A: '-3',
    7: '-4',
    B: '-4',

    // Middle Octave
    '1º': '+4',
    Cº: '+4',
    '1*': '+4',
    '2º': '-5',
    Dº: '-5',
    '2*': '-5',
    '3º': '+5',
    Eº: '+5',
    '3*': '+5',
    '4º': '-6',
    Fº: '-6',
    '4*': '-6',
    '5º': '+6',
    Gº: '+6',
    '5*': '+6',
    // '6º': '[X]', 'Aº': '[X]', - No mapping, throw
    '7º': '-7',
    Bº: '-7',
    '7*': '-7',

    // Highest Note
    '1ºº': '+7',
    Cºº: '+7',
  }

  return kalimbaStr
    .split('\n')
    .map((line) => {
      if (!line.trim()) return ''
      return line
        .trim()
        .split(/\s+/)
        .map((token) => {
          const cleanToken = token.toUpperCase().replace(/°/g, 'º')

          const mappedToken = noteMap[cleanToken]
          if (!mappedToken) {
            throw new Error(
              `No mapping found for token "${token}", on line "${line}"`,
            )
          }

          return mappedToken
        })
        .join(', ')
    })
    .join('\n')
}

function main() {
  const options = {
    song: {
      type: 'string',
      short: 's',
      description: 'The raw Kalimba note text string',
    },
    help: {
      type: 'boolean',
      short: 'h',
      description: 'Show help information',
    },
  }

  try {
    const { values } = parseArgs({ options, allowPositionals: false })

    if (values.help) {
      console.log('Usage: node convert.js --song="C D E G\\nE D C"')
      console.log('\nOptions:')
      console.log('  -s, --song    The raw text string of your song notes')
      console.log('  -h, --help    Show this message')
      process.exit(0)
    }

    if (!values.song) {
      console.error('Error: Missing required option --song (-s)')
      console.log('Run: node convert.js --help for info.')
      process.exit(1)
    }

    const accordionTabs = convertKalimbaToAccordion(values.song)
    console.log(accordionTabs)
  } catch (error) {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }
}

main()
