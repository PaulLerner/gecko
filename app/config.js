import * as constants from './constants'
var config = {
    wavesurfer: {
        container: '#waveform',
        waveColor: 'black',
        // waveColor == progressColor => no progress painting
        // progressColor: 'black',
        pixelRatio: 1,
        autoCenter : false,
        autoCenterImmediately: true,
        height: '350',
        useSpectrogram: true,
        scrollParent: true
    },
    parserOptions: {
        srt: {
            groupWords: true
        }
    },
    applicationMode:constants.APPLICATION_MODE.VANILLA,
    slider: "#slider",
    isServerMode: false
}

export { config }
