const playPartTemplate = require('ngtemplate-loader?requireAngular!html-loader!../static/templates/playPart.html')

export function playPartDirective() {
  return {
    replace: true,
    restrict: "E",
    scope: {
      'audioContext': '=',
      'audioBackend': '=',
      'wavesurfer': '=',
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
          let parent = scope.$parent.ctrl;
          if (parent.selectedRegion) {
            scope.rep.start = parent.selectedRegion.start;
            scope.rep.end = parent.selectedRegion.end;
          } else {
            return;
          }
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

      const playRegion = (currentRegion, nextRegionIndex) => {
        currentRegion.on('out', null)
        if (nextRegionIndex < scope.speakerRegions.length - 1) {
          const nextRegion = scope.speakerRegions[nextRegionIndex]
          nextRegion.on('out', () => playRegion(nextRegion, nextRegionIndex + 1))
          //seek(nextRegion.start)
          scope.wavesurfer.setCurrentTime(nextRegion.start);
        }
      }

      const seek = (time) => {
        scope.wavesurfer.seekTo((time) / scope.wavesurfer.getDuration());
      }

      scope.playFirstRegion  = function () {
        /**
        *plays first region (might redefine what 'first' means later on) of the speaker the user clicked on
        *warns when no region labelled as scope.$parent.speaker were found
        */
        scope.wavesurfer.stop();
        scope.wavesurfer.seekTo(0);
        scope.speakerRegions = [];
        var ctrl = scope.$parent.ctrl;
        var speaker_id=scope.$parent.speaker;
        //console.log("speaker_id",speaker_id);
        var first_region=null;
        ctrl.iterateRegions(function (region) {
          let current_speaker = region.data.speaker;
          if (current_speaker[0] === speaker_id) {
            scope.speakerRegions.push(region);
            if (!first_region){
              first_region=region;
              //seek(region.start);
              scope.wavesurfer.setCurrentTime(region.start);
            }

          }
        });
        if (scope.speakerRegions.length) {
          scope.speakerRegions[0].on('out', () => playRegion(scope.speakerRegions[0], 1));
          //if (current_speaker[0] === speaker_id)
          scope.wavesurfer.play();
        } else {
          console.warn("There's no region labelled as "+speaker_id);
        }
      }

  }
}
}
