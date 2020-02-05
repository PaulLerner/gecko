import * as constants from './constants'
var config = {
    wavesurfer: {
        container: '#waveform',
        waveColor: 'black',
        // waveColor == progressColor => no progress painting
        // progressColor: 'black',
        pixelRatio: 1,
        autoCenter : true,
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
    applicationMode:constants.APPLICATION_MODE.DIARIZATION,
    slider: "#slider",
    isServerMode: false
}

export { config }
