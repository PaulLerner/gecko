const playPartTemplate = require('ngtemplate-loader?requireAngular!html-loader!../static/templates/playPart.html')

export function playPartDirective() {
  return {
    replace: true,
    restrict: "E",
    scope: {
      'audioContext': '=',
      'audioBackend': '=',
      'rep': '=representative'
    },
    templateUrl: playPartTemplate,
    link: function (scope, element, attrs) {
      if(!scope.rep){
        scope.rep = {};
      }


      //taken from:
      //https://github.com/vikasmagar512/wavesurfer-audio-editor/blob/master/src/utils/waveSurferOperation.js
      function cut(start, end) {
        /*
        ---------------------------------------------
        The function will take the buffer used to create the waveform and will
        create
        a new blob with the selected area from the original blob using the
        offlineAudioContext
        */
        var originalAudioBuffer = scope.audioBackend.buffer;

        var lengthInSamples = Math.ceil((end - start) * originalAudioBuffer.sampleRate);
        if (!window.OfflineAudioContext) {
          if (!window.webkitOfflineAudioContext) {
            // $('#output').append('failed : no audiocontext found, change browser');
            alert('webkit context not found')
          }
          window.OfflineAudioContext = window.webkitOfflineAudioContext;
        }

        var offlineAudioContext = scope.audioBackend.ac

        var emptySegment = offlineAudioContext.createBuffer(
          originalAudioBuffer.numberOfChannels,
          lengthInSamples,
          originalAudioBuffer.sampleRate);

          for (var channel = 0; channel < originalAudioBuffer.numberOfChannels; channel++) {

            var empty_segment_data = emptySegment.getChannelData(channel);
            var original_channel_data = originalAudioBuffer.getChannelData(channel);

            var mid_data = original_channel_data.subarray(Math.ceil(start * originalAudioBuffer.sampleRate), Math.floor(end * originalAudioBuffer.sampleRate));

            empty_segment_data.set(mid_data);
          }

          return emptySegment;
        }

      scope.isPlaying = false;
      let source;

      function play() {
        scope.rep.start = parseFloat(scope.rep.start);
        scope.rep.end = parseFloat(scope.rep.end);

        if (isNaN(scope.rep.start) && isNaN(scope.rep.end)) {
          return;
        }

        source = scope.audioContext.createBufferSource(); // creates a sound source

        source.addEventListener('ended', function () {
          scope.isPlaying = false;
          scope.$evalAsync();
        });
        source.addEventListener('out', function () {
          scope.isPlaying = false;
          scope.$evalAsync();
        });

        source.buffer = cut(scope.rep.start, scope.rep.end); // tell the source which sound to play
        source.connect(scope.audioContext.destination);       // connect the source to the context's destination (the speakers)
        source.start(0);
        scope.isPlaying = true;
      }

      function stop() {
        source.stop();
        scope.isPlaying = false;
      }
      this.preventSingleClick = false;
      this.delay=200;
      scope.playFirstRegion = function () {
        /**
        *plays the first region of the speaker the user clicked on
        *warns when no region labelled as scope.$parent.speaker were found
        */
        this.preventSingleClick = true;
        clearTimeout(this.timer);
        var ctrl = scope.$parent.ctrl;
        var speaker_id=scope.$parent.speaker;
        let firstRegion = null;
        ctrl.iterateRegions(function (region) {
            let current_speaker = region.data.speaker;

            if (current_speaker[0]==speaker_id){
                if (!firstRegion) {
                    firstRegion = region;
                    const [speaker_regions, _] = ctrl.getSpeakerRegions(region);
                    //speaker_regions are sort in desc.
                    speaker_regions[0].play();
                  }
                }
              });
              if (firstRegion===null) console.warn("There's no region labelled as "+speaker_id);
      }
      scope.playCentroid  = function () {
        /**
        *plays centroid region of the speaker the user clicked on
        *warns when no region labelled as scope.$parent.speaker were found
        */
        this.preventSingleClick = false;
        const delay=200;
        this.timer = setTimeout(() => {
        if (!this.preventSingleClick) {
          var ctrl = scope.$parent.ctrl;
          var speaker_id=scope.$parent.speaker;
          let firstRegion = null;
          ctrl.iterateRegions(function (region) {
              let current_speaker = region.data.speaker;

              if (current_speaker[0]==speaker_id){
                  if (!firstRegion) {
                      firstRegion = region;
                      const [speaker_regions, _] = ctrl.getSpeakerRegions(region);
                      //speaker_regions are sort in desc. so play the 'last' region
                      var centroid=speaker_regions[speaker_regions.length-1];
                      scope.rep.start = centroid.start;
                      scope.rep.end=centroid.end;
                      scope.playStop();
                  }
              }
          });
          if (firstRegion===null) console.warn("There's no region labelled as "+speaker_id);
          }
        }, delay);

      }

      scope.playStop = function () {
        scope.isPlaying ? stop() : play();
      }
  }
}
}
