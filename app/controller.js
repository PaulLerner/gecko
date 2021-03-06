import initWaveSurfer from './wavesurfer.js'
import uuidv4 from 'uuid/v4'

import * as constants from './constants'

import './third-party/soundtouch.js'

import {config} from './config.js'
import Swal from 'sweetalert2'
import {PUNCTUATION_TYPE} from "./constants";

import videojs from 'video.js'

import Shortcuts from './shortcuts'

import { parse as parseTextFormats, convert as convertTextFormats } from './textFormats'

import { jsonStringify } from './utils'

var Diff = require('diff');

var demoJson = require('../samples/demo');

const audioModalTemplate = require('ngtemplate-loader?requireAngular!html-loader!../static/templates/selectAudioModal.html')
const shortcutsInfoTemplate = require('ngtemplate-loader?requireAngular!html-loader!../static/templates/shortcutsInfo.html')

function sortDict(dict, sortBy, sortFunction) {
    var sorted = {};

    if (sortBy !== undefined) {
        sortFunction = function (a, b) {
            return (dict[a][sortBy] < dict[b][sortBy]) ? -1 : ((dict[a][sortBy] > dict[b][sortBy]) ? 1 : 0)
        };
    }

    // sort by keys if sortFunction is undefined
    Object.keys(dict).sort(sortFunction).forEach(function (key) {
        sorted[key] = dict[key];
    });

    return sorted;
}

// First, checks if it isn't implemented yet.
if (!String.prototype.format) {
    String.prototype.format = function () {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function (match, number) {
            return typeof args[number] != 'undefined'
                ? args[number]
                : match
                ;
        });
    };
}

function str_pad_left(string, pad, length) {
    return (new Array(length + 1).join(pad) + string).slice(-length);
}

function secondsToMinutes(time) {
    var nstring = (time.toFixed(3) + ""),
        nindex = nstring.indexOf("."),
        floatPart = (nindex > -1 ? nstring.substring(nindex + 1) : "000");
    return str_pad_left(Math.floor(time / 60), '0', 2) + ':' + str_pad_left(Math.floor(time % 60), '0', 2) + "." + floatPart;
}

class MainController {
    constructor($scope, $uibModal, dataManager, dataBase, $timeout, $interval, eventBus) {
        this.dataManager = dataManager;
        this.dataBase = dataBase;
        this.$uibModal = $uibModal;
        this.$scope = $scope;
        this.$timeout = $timeout
        this.$interval = $interval
        this.isServerMode = false
        this.shortcuts = new Shortcuts(this, constants)
        this.shortcuts.bindKeys()
        this.eventBus = eventBus
    }
    loadApp(config) {
        const urlParams = new URLSearchParams(window.location.search)
        const saveMode = urlParams.get('save_mode')
        if (saveMode) {
            if (saveMode === 'server') {
                this.isServerMode = true
            } else if (saveMode === 'local') {
                this.isServerMode = false
            }
        }

        const audio = urlParams.get('audio')
        let formats = ['rttm', 'tsv', 'json', 'ctm']
        formats = formats.map((f) => {
            if (urlParams.get(f)) {
                return {
                    format: f,
                    url: urlParams.get(f)
                }
            }
            return null
        }).filter(Boolean)
        let serverConfig = null
        if (audio || formats.length) {
            serverConfig = {
                mode: 'server',
                ctms: []
            }

            if (audio) {
                serverConfig.audio = {
                    url: audio
                }
            }

            if (formats.length) {
                formats.forEach(f => {
                    const fileName = f.url.split('/').pop().split('.')[0]
                    serverConfig.ctms = [
                        {
                            url: f.url,
                            fileName: fileName + '.' + f.format
                        }
                    ]
                })
            }
        }
        if (config.mode === 'server' || serverConfig) {
            this.loadServerMode(serverConfig ? serverConfig : config);
        } else {
            this.loadClientMode();
        }
    }
    resetApplicationMode(applicationMode){
      this.applicationMode=applicationMode
      this.applicationModes={}
      for (const [key, value] of Object.entries(constants.APPLICATION_MODE)) {
        this.applicationModes[key] = applicationMode==value
      }
      if (this.applicationModes.VANILLA){
        this.wavesurfer.enableDragSelection(
            {
                drag: false,
                minLength: constants.MINIMUM_LENGTH
            });
      }
      else {
        this.wavesurfer.disableDragSelection();
      }
    }

    reset () {
        this.wavesurfer && this.wavesurfer.destroy()
        this.$scope.$evalAsync(() => {
            this.loader = false
            this.audioFileName = null
            this.currentTime = '00:00'
            this.zoomLevel = constants.ZOOM
            this.isPlaying = false
            this.playbackSpeeds = constants.PLAYBACK_SPEED
            this.currentPlaybackSpeed = 1
            this.videoMode = false
            this.showSpectrogram = false
            this.showSpectrogramButton = false
            this.spectrogramReady = false
        })
    }
    init() {
        this.currentTime = "00:00";
        // this.currentTimeSeconds = 0;
        this.zoomLevel = constants.ZOOM;
        this.currentGainProc = constants.DEFAULT_GAIN * 100
        this.minGainProc = constants.MIN_GAIN * 100
        this.maxGainProc = constants.MAX_GAIN * 100
        this.maxZoom = constants.MAX_ZOOM
        this.isPlaying = false;
        this.playbackSpeeds = constants.PLAYBACK_SPEED;
        this.currentPlaybackSpeed = 1;
        this.videoMode = false
        this.showSpectrogram = false
        this.showSpectrogramButton = false
        this.spectrogramReady = false
        if (config.wavesurfer.useSpectrogram) {
            this.showSpectrogramButton = true;
        }
        this.APPLICATION_MODE=constants.APPLICATION_MODE;
        this.applicationMode = config.applicationMode;
        this.undoStack = [];
        this.regionsHistory = {};
        this.updateOtherRegions = new Set();

        this.isRegionClicked = false;
        this.isTextChanged = false;
        this.wavesurfer = initWaveSurfer();
        this.wavesurferElement = this.wavesurfer.drawer.container;

        this.ctmData = [];
        this.ready = false;

        var self = this;

        this.eventBus.on('wordClick', (word, e) => {
            this.seek(word.start, 'right')
            e.preventDefault()
            e.stopPropagation()
        })

        this.eventBus.on('regionTextChanged', (fileIndex) => {
            let currentRegion = this.currentRegions[fileIndex]
            this.addHistory(currentRegion)
            this.undoStack.push([constants.REGION_TEXT_CHANGED_OPERATION_ID, currentRegion.id])
            this.eventBus.trigger('geckoChanged', {
                event: 'regionTextChanged',
                data: currentRegion
            })
        })

        document.onkeydown = (e) => {
            if (e.key === 'Escape') {
                if (document.activeElement) {
                    document.activeElement.blur();
                }
                return;
            }

            // this.shortcuts.checkKeys(e)
            this.$scope.$evalAsync()
            /* if (e.key === 'ArrowRight' && isDownCtrl) {
                self.jumpNextDiscrepancy();
            } */
        };

        this.wavesurferElement.onclick = function (e) {
            if (!self.isRegionClicked) {
                self.calcCurrentFileIndex(e);
                // self.deselectRegion();
            }

            self.isRegionClicked = false;
        };

        this.wavesurfer.on('audioprocess', function (e) {
            self.updateView();
        });

        this.wavesurfer.on('error', (e) => {
            Swal.fire({
                icon: 'error',
                title: 'Wavesurfer error',
                text: e
            })
            console.error("wavesurfer error:")
            console.log(e)
            this.reset()
            if (!this.isServerMode) {
                this.loadClientMode()
            }
        });

        this.wavesurfer.on('loading', function () {
            self.$scope.$evalAsync(function () {
                self.loader = true;
            });
        });

        this.wavesurfer.on('ready', function (e) {
            self.resetApplicationMode(self.applicationMode);
            self.previousHeight = parseInt(self.wavesurfer.getHeight());
            self.totalTime = secondsToMinutes(self.wavesurfer.getDuration());
            self.wavesurfer.enableDragSelection(
                {
                    drag: false,
                    minLength: constants.MINIMUM_LENGTH
                });

            self.$scope.$watch(() => self.zoomLevel, function (newVal, oldVal) {
                if (newVal) {
                    if (!self.noUpdateZoom) {
                        if (Math.round(newVal) !== Math.round(oldVal)) {
                            self.wavesurfer.zoom(self.zoomLevel);
                        }
                    } else {
                        self.noUpdateZoom = false
                    }
                }
            });

            self.$scope.$watch(() => self.currentGainProc, function (newVal) {
                if (newVal) {
                    self.gainNode.gain.value = newVal / 100
                }
            });

            self.createSpeakerLegends();

            self.addRegions();


            // // map between speakers according to EDER mapping
            // if (self.EDER) {
            //     var mapping = self.EDER.map;
            //     for (let s in self.speakersColors) {
            //         var mapped = mapping[s];
            //         if (mapped) {
            //             self.speakersColors[mapped] = self.speakersColors[s];
            //         }
            //     }
            // }

            self.transcriptPanelSize = parseInt(9 / self.filesData.length);

            // select the first region
            self.selectedFileIndex = 0;
            self.selectRegion();

            // var interval = setInterval(function () {
            //     self.iterateRegions(function (region) {
            //         if (region.end <= region.start) {
            //             alert("STOP! CALL GOLAN.");
            //             console.log("start: {0} End: {1}".format(region.start, region.end));
            //             console.log(region);
            //             clearInterval(interval);
            //             throw "ERROR";
            //         }
            //     });
            // }, 100)

            self.initAudioContext();

            self.handleCtm();

            var st = new soundtouch.SoundTouch(self.wavesurfer.backend.ac.sampleRate);
            var buffer = self.wavesurfer.backend.buffer;
            var channels = buffer.numberOfChannels;
            var l = buffer.getChannelData(0);
            var r = channels > 1 ? buffer.getChannelData(1) : l;
            self.length = buffer.length;
            self.seekingPos = null;
            var seekingDiff = 0;

            var source = {
                extract: function (target, numFrames, position) {
                    if (self.seekingPos != null) {
                        seekingDiff = self.seekingPos - position;
                        self.seekingPos = null;
                    }

                    position += seekingDiff;

                    for (var i = 0; i < numFrames; i++) {
                        target[i * 2] = l[i + position];
                        target[i * 2 + 1] = r[i + position];
                    }

                    return Math.min(numFrames, self.length - position);
                }
            }


            self.soundtouchNode = null;

            self.gainNode = self.wavesurfer.backend.ac.createGain()
            self.gainNode.gain.value = self.currentGainProc / 100

            var filter = new soundtouch.SimpleFilter(source, st);
            self.soundtouchNode = soundtouch.getWebAudioNode(self.wavesurfer.backend.ac, filter);

            self.wavesurfer.on('play', function () {
                self.seekingPos = ~~(self.wavesurfer.backend.getPlayedPercents() * self.length);
                st.tempo = self.wavesurfer.getPlaybackRate();
                self.wavesurfer.backend.disconnectFilters();

                if (st.tempo === 1) {
                    self.wavesurfer.backend.setFilters([self.gainNode])
                } else {
                    self.wavesurfer.backend.setFilters([self.soundtouchNode, self.gainNode])
                }

                self.isPlaying = true;
                self.$scope.$evalAsync();
            });

            self.wavesurfer.on('pause', function () {
                self.soundtouchNode && self.soundtouchNode.disconnect();
                self.isPlaying = false;
                self.$scope.$evalAsync();
            });


            self.loader = false;
            self.ready = true;

            window.onbeforeunload = function (event) {
                return confirm("Confirm refresh");
            };

            self.$scope.$evalAsync();
        });

        this.wavesurfer.on('seek', function (e) {
            self.updateView();
            self.videoPlayer && self.videoPlayer.currentTime(self.wavesurfer.getCurrentTime())

            self.$scope.$evalAsync();
        });

        this.wavesurfer.on("region-created", function (region) {

            var numOfFiles = self.filesData.length;

            // indication when file was created by drag
            if (region.data.fileIndex === undefined) {
                // to notify "region-update" for the first update
                // (to get the start value which for some reason we don't get on "region-created")

                self.calcCurrentFileIndex(event);

                region.data.fileIndex = self.selectedFileIndex;
                // region.data.speaker = constants.UNKNOWN_SPEAKER;
                region.data.speaker = [];

                region.data.initFinished = false;

            } else {
                // fix regions if not added through drag (on drag there is no 'start')
                self.fixRegionsOrder(region);

                // when file is added by dragging, update-end will take care of history
                self.addHistory(region);
            }
            //TODO: creating a new word is bad if we want to keep the segment clear.
            if (!region.data.words || region.data.words.length === 0) {
                region.data.words = [{start: region.start, end: region.end, text: ""}];
            }

            var elem = region.element;


            // Shrink regions
            elem.style.height = 100 / numOfFiles + "%";
            // Arrange regions top to bottom
            elem.style.top = 100 / numOfFiles * parseInt(region.data.fileIndex) + "%";

            // unset handlers manual style
            if (elem.children.length) {
               elem.children[0].removeAttribute('style');
               elem.children[1].removeAttribute('style');
            }

            // region.color = self.filesData[region.data.fileIndex].legend[region.data.speaker];
            // if (region.data.speaker !== 'EDER') {
            // region.color = self.speakersColors[region.data.speaker];
            // }

            self.regionUpdated(region);
            self.updateView();
        });

        this.wavesurfer.on("region-updated", function (region) {
          self.regionPositionUpdated(region);

        });

        this.wavesurfer.on('region-update-end', function (region) {

            self.regionPositionUpdated(region);

            var multiEffect = [region.id];
            self.addHistory(region);

            for (let r of self.updateOtherRegions) {
                self.addHistory(r);
                multiEffect.push(r.id);
            }

            self.updateOtherRegions.clear()
            self.undoStack.push(multiEffect);
            this.eventBus.trigger('geckoChanged', {
                event: 'regionUpdateEnd',
                data: region
            })

            self.$scope.$evalAsync();

        });


        // this.wavesurfer.on('region-in', function (region) {
        //     if (region.data.fileIndex === self.selectedFileIndex) {
        //         self.selectRegion(region);
        //     }
        //
        //     self.currentRegions[region.data.fileIndex] = region;
        // });

        // this.wavesurfer.on('region-out', function (region) {
        //     if (region.data.fileIndex === self.selectedFileIndex) {
        //         self.deselectRegion(region)
        //     }
        //
        //     self.currentRegions[region.data.fileIndex] = undefined;
        // });

        this.wavesurfer.on('region-click', function (region) {
            self.isRegionClicked = true;
            self.selectedFileIndex = region.data.fileIndex;

            // self.selectRegion(region);
            //self.updateView();
        });

        this.$interval(() => {
            this.saveToDB()
        }, constants.SAVE_THRESHOLD)

    }

    zoomIntoRegion () {
        if (this.selectedRegion) {
            const delta = this.selectedRegion.end - this.selectedRegion.start
            const wavesurferWidth = this.wavesurfer.container.offsetWidth

            let zoomLevel = wavesurferWidth / delta

            if (zoomLevel > constants.MAX_ZOOM){
                zoomLevel = constants.MAX_ZOOM
            }

            this.wavesurfer.zoom(zoomLevel);
            this.noUpdateZoom = true
            this.zoomLevel = zoomLevel
            this.seek(this.selectedRegion.start)

            const midPosition = (this.selectedRegion.start + this.selectedRegion.end) / 2 * zoomLevel
            this.wavesurfer.container.children[0].scrollLeft = midPosition - (wavesurferWidth / 2)
            // const startPosition = this.selectedRegion.start * zoomLevel
            // this.wavesurfer.container.children[0].scrollLeft = startPosition
        }
    }

    async saveToDB () {
        await this.dataBase.clearFiles()
        await this.dataBase.saveFiles(this.filesData)
    }

    // for debugging
    _printRegionsInfo(fileIndex) {
        var self = this;
        let i = 0;
        var formatted = {};
        this.iterateRegions(function (region) {
            var r = self.copyRegion(region);
            r.i = i;
            r.fileIndex = r.data.fileIndex;
            r.speaker = r.data.speaker.join(constants.SPEAKERS_SEPARATOR);
            r.initFinished = r.data.initFinished;
            delete r.data;
            delete r.drag;
            delete r.minLength;
            var id = r.id;
            delete r.id;
            formatted[id] = r;
            i++;
        }, fileIndex, true);

        console.table(formatted);
    }

    _printHistoryInfo(onlyAvailableHistory) {
        var self = this;

        Object.keys(this.regionsHistory).forEach(function (key) {
            var history = self.regionsHistory[key];
            var formatted = [];

            if (onlyAvailableHistory && history.length < 2) {
                return;
            }

            for (let i = 0; i < history.length; i++) {
                var region = history[i];
                if (region) {
                    var r = self.copyRegion(region);
                    r.fileIndex = r.data.fileIndex;
                    r.speaker = r.data.speaker.join(constants.SPEAKERS_SEPARATOR);
                    r.initFinished = r.data.initFinished;
                    delete r.data;
                    delete r.drag;
                    delete r.minLength;

                    formatted.push(r);
                } else {
                    formatted.push(region);
                }
            }

            console.log(key);
            console.table(formatted);
        });
    }


    handleCtm() {
        if (this.ctmData.length !== 2 || this.filesData.length !== 2) return;

        let diff = Diff.diffArrays(this.ctmData[0], this.ctmData[1], {
            comparator: function (x, y) {
                return x.text === y.text;
            }
        });

        // discrepancies is also the indication if we are in ctm comparing mode
        this.discrepancies = [];
        this.wavesurfer.params.autoCenter = true;

        function handleDiscrepancy(discrepancy, diffItem) {
            if (diffItem.removed) {
                if (discrepancy.old) {
                    throw "Does not suppose to happen";
                }
                discrepancy.old = diffItem.value;
            } else {
                if (discrepancy.new) {
                    throw "Does not suppose to happen";
                }
                discrepancy.new = diffItem.value;
            }
        }

        for (let i = 0; i < diff.length; i++) {
            if (diff[i].removed || diff[i].added) {
                let discrepancy = {};
                handleDiscrepancy(discrepancy, diff[i])

                i++;

                //check for the other side of the discrepancy
                if (i < diff.length && (diff[i].removed || diff[i].added)) {
                    handleDiscrepancy(discrepancy, diff[i])
                }

                this.discrepancies.push(discrepancy);
            }
        }

        this.discrepancies.forEach(function (discrepancy) {
            let oldStart = Infinity;
            let oldEnd = 0;

            if (discrepancy.old) {
                discrepancy.oldText = discrepancy.old.map(x => x.text).join(" ");
                oldStart = discrepancy.old[0].start;
                oldEnd = discrepancy.old[discrepancy.old.length - 1].end;
            }

            let newStart = Infinity;
            let newEnd = 0;

            if (discrepancy.new) {
                discrepancy.newText = discrepancy.new.map(x => x.text).join(" ");
                newStart = discrepancy.new[0].start;
                oldEnd = discrepancy.new[discrepancy.new.length - 1].end;
            }

            if (newStart > oldStart) {
                discrepancy.start = oldStart;
            } else {
                discrepancy.start = newStart;
            }

            if (newEnd > oldEnd) {
                discrepancy.end = newEnd;
            } else {
                discrepancy.end = oldEnd;
            }

            discrepancy.startDisp = secondsToMinutes(discrepancy.start);
            discrepancy.endDisp = secondsToMinutes(discrepancy.end);
        });
    }

    fixRegionsOrder(region) {
        var prevRegion = this.findClosestRegionToTime(region.data.fileIndex, region.start, true);

        if (prevRegion) {
            region.prev = prevRegion.id;
            prevRegion.next = region.id;
        } else {
            region.prev = null;
        }

        var nextRegion = this.findClosestRegionToTime(region.data.fileIndex, region.end);

        if (nextRegion) {
            region.next = nextRegion.id;
            nextRegion.prev = region.id;
        } else {
            region.next = null;
        }
    }

    addHistory(region) {
        if (!this.regionsHistory[region.id]) {
            this.regionsHistory[region.id] = [];
        }

        const regionCopy = this.copyRegion(region)
        this.regionsHistory[region.id].push(regionCopy);
    }

    regionPositionUpdated(region) {
        var self = this;

        self.selectRegion(region);

        if (!region.data.initFinished) {
            region.data.initFinished = true;
            this.fixRegionsOrder(region);
        }

        var prevRegion = this.getRegion(region.prev);
        var nextRegion = this.getRegion(region.next);

        if (prevRegion !== null) {
            if (region.start < prevRegion.start + constants.MINIMUM_LENGTH) {
                region.start = prevRegion.start + constants.MINIMUM_LENGTH;
                region.end = Math.max(region.start + constants.MINIMUM_LENGTH, region.end);
            }

            if (region.start < prevRegion.end) {
                prevRegion.end = region.start;
                self.updateOtherRegions.add(prevRegion);
                self.regionUpdated(prevRegion);
            }
        }

        if (nextRegion !== null) {
            if (region.end > nextRegion.end - constants.MINIMUM_LENGTH) {
                region.end = nextRegion.end - constants.MINIMUM_LENGTH;
                region.start = Math.min(region.start, region.end - constants.MINIMUM_LENGTH);
            }

            if (region.end > nextRegion.start) {
                nextRegion.start = region.end;
                self.updateOtherRegions.add(nextRegion);
                self.regionUpdated(nextRegion);
            }
        }

        self.regionUpdated(region);
    }

    // change region visually
    regionUpdated(region) {

        // fix first and last words
        let words = region.data.words;
        words[0].start = region.start;
        words[words.length - 1].end = region.end;

        region.element.style.background = "";

        if (region.data.speaker.length === 0) {
            region.color = constants.UNKNOWN_SPEAKER_COLOR;
        } else if (region.data.speaker.length === 1) {
            region.color = this.filesData[region.data.fileIndex].legend[region.data.speaker[0]];

        } else {
            let line_width = 20;

            let colors = region.data.speaker.map((s, i) =>
                "{0} {1}px".format(this.filesData[region.data.fileIndex].legend[s], (i + 1) * line_width)).join(',');

            region.element.style.background =
                "repeating-linear-gradient(135deg, {0})".format(colors);

        }

        //TODO: This also happens at other times so we cannot determine things after it
        // unless we fork the repo and set an "afterrender" event so we could change the region however we'd like
        region.updateRender();

        // region.element.title = region.data.speaker;

        this.$scope.$evalAsync();
    }

    copyRegion(region) {

        //TODO: change the copy of data to deep copy by "JSON.parse(JSON.stringify(object))"
        // and then handle "words" correctly
        return {
            id: region.id,
            // data: {
            //     initFinished: region.data.initFinished,
            //     words: JSON.parse(JSON.stringify(region.data.words)),
            //     fileIndex: region.data.fileIndex,
            //     speaker: region.data.speaker.slice() // copy by value
            // },
            data: JSON.parse(JSON.stringify(region.data)),
            start: region.start,
            end: region.end,
            drag: region.drag,
            minLength: constants.MINIMUM_LENGTH
        }
    }


    undo() {
        let self = this;
        if (!this.undoStack.length) {
            return;
        }

        var regionIds = this.undoStack.pop();
        let needUpdateEditable = false

        if (regionIds[0] === constants.SPEAKER_NAME_CHANGED_OPERATION_ID) {
            let fileIndex = regionIds[1];
            let oldSpeaker = regionIds[2];
            let newSpeaker = regionIds[3];
            let oldColor=regionIds[4];
            if (self.filesData[fileIndex].legend[oldSpeaker] === undefined){//old speaker doesn't exist anymore
              self.newSpeakerName =oldSpeaker;
              self.addSpeaker(oldColor);
            }
            else {
                self.updateLegend(fileIndex, newSpeaker, oldSpeaker);
              }

            self.updateLegend(fileIndex, newSpeaker, oldSpeaker);

            regionIds = regionIds[4];
        } else if (regionIds[0] === constants.REGION_TEXT_CHANGED_OPERATION_ID) {
            needUpdateEditable = true
            regionIds = [regionIds[1]]
        }


        for (let regionId of regionIds) {

            var history = this.regionsHistory[regionId];

            var lastState = history.pop();

            if (lastState === null) {
                // pop again because "region-created" will insert another to history
                var newRegion = this.wavesurfer.addRegion(history.pop());
                this.regionPositionUpdated(newRegion);
            } else if (history.length === 0) {
                this.__deleteRegion(this.getRegion(regionId));
            } else {
                this.wavesurfer.regions.list[regionId].update(this.copyRegion(history[history.length - 1]));
                if (needUpdateEditable && this.selectedRegion && this.selectedRegion.id === regionId) {
                    this.$timeout(() => this.eventBus.trigger('resetEditableWords'))
                }
            }
        }

        this.updateView();
        this.$scope.$evalAsync();
    }

    updateView() {
        this.selectRegion();
        this.silence = this.calcSilenceRegion();
        this.setCurrentTime();
        this.calcCurrentRegions();
        this.updateSelectedDiscrepancy();
    }

    calcCurrentFileIndex(e) {
        var scrollBarHeight = 20;
        var wavesurferHeight = this.wavesurfer.getHeight() - scrollBarHeight;

        // vertical click location
        var posY = e.pageY - e.target.offsetTop;

        this.selectedFileIndex = parseInt(posY / wavesurferHeight * this.filesData.length);
    }

    deselectRegion(region) {
        if (region !== undefined) {
            region.element.classList.remove("selected-region");
            if (this.selectedRegion === region) {
                this.selectedRegion = undefined;
            }
        } else if (this.selectedRegion) {
            if (this.selectedRegion.element) {
                this.selectedRegion.element.classList.remove("selected-region");
            }
            this.selectedRegion = undefined;
        }
    }

    calcCurrentRegions() {
        for (let i = 0; i < this.filesData.length; i++) {
            const currentRegion = this.getCurrentRegion(i);
            if (currentRegion && currentRegion !== this.currentRegions[i]) {
                this.$timeout(() => this.eventBus.trigger('resetEditableWords', currentRegion))
            } else if (!currentRegion) {
                this.$timeout(() => this.eventBus.trigger('cleanEditableDOM', i))
            }
            this.currentRegions[i] = currentRegion
        }

        this.$scope.$$postDigest(this.updateSelectedWordInFiles.bind(this));
    }

    getCurrentRegion(fileIndex) {
        let region;

        var time = this.wavesurfer.getCurrentTime();
        this.iterateRegions(function (r) {
            if (time >= r.start - constants.TOLERANCE && time <= r.end + constants.TOLERANCE) {
                region = r;
            }
        }, fileIndex);

        return region;
    }

    selectRegion(region) {
        if (!region) {
            region = this.getCurrentRegion(this.selectedFileIndex);
        }

        this.deselectRegion();

        if (!region) {
            return
        }

        region.element.classList.add("selected-region");

        this.selectedRegion = region;
    }
    getSpeakerRegions(region){
      /**
      * @param {Region} region you wish to get speaker regions from.
      returns an array of regions of the same speaker as region, along with the index of this region in this array.
      */
      var speaker_regions=[];
      var region_id=region.id;
      var speaker_id=region.data.speaker[0];
      var region_index;
      var i =0;
      this.iterateRegions(function (r) {
        if (r.data.speaker[0]==speaker_id)
        {
          speaker_regions.push(r);
          if(r.id == region_id){
            region_index=i;
          }
          i+=1;
        }
      });
      if (!this.applicationModes.VANILLA){
        speaker_regions.sort(function(first, second) {
          //first - second -> asc order
          //sort region in desc order as we want the user to discard the most unsure regions first.
         return second.data.distance-first.data.distance;
        });
        region_index= this.getRegionIndex(speaker_regions, this.selectedRegion);
      }
      return [speaker_regions, region_index]
    }
    getRegionIndex(regions, region){
      /**
      * @param {array} regions : array of regions where you suppose region is somewhere
      * @param {Region} region : the region that is supposedly in regions at an unknown index
      * @return {number} index : index of the region in regions.
      */
      for (var index = 0; index < regions.length; index++){
        if(regions[index] == region) return index;
      }
      return -1;
    }
    jumpRegion(next) {
        var region;
        if (this.deselectedRegion)//jumps to the same speaker regions that the user de-selected
        {
          var selectedRegion=this.deselectedRegion
          this.deselectedRegion=null
        }
        else
        {
          var selectedRegion = this.selectedRegion
        }
        if (selectedRegion) {
            if (next) {
              if (this.applicationModes.VANILLA){
                region = this.wavesurfer.regions.list[selectedRegion.next];
              }
              else {//play next region of the same speaker
                const [speaker_regions, region_index] = this.getSpeakerRegions(selectedRegion);
                region=speaker_regions[region_index+1];
                //increment region # of annotators
                if (!selectedRegion.data.annotators) selectedRegion.data.annotators=0
                selectedRegion.data.annotators+=1
              }
            }
            else {
              if (this.applicationModes.VANILLA){
                region = this.wavesurfer.regions.list[selectedRegion.prev];
              }
              else {
                const [speaker_regions, region_index] = this.getSpeakerRegions(selectedRegion);
                if (region_index-1 >= 0)//play previous region of the same speaker
                {
                  region=speaker_regions[region_index-1];
                }
                else//go back to last region
                {
                  console.log("going back to last region")
                  region=speaker_regions[speaker_regions.length-1];
                }
              }
            }
        }
        else {
            if (next) {
                region = this.findClosestRegionToTime(this.selectedFileIndex, this.wavesurfer.getCurrentTime());
            } else {
                region = this.findClosestRegionToTime(this.selectedFileIndex, this.wavesurfer.getCurrentTime(), true);
            }
        }

        if (region) {
            region.play();
        }
    }

    jumpNextDiscrepancy() {
        if (!this.discrepancies) return;

        let time = this.wavesurfer.getCurrentTime();

        let i = 0;
        for (; i < this.filteredDiscrepancies.length; i++) {
            if (this.filteredDiscrepancies[i].start > time + constants.EXTRA_DISCREPANCY_TIME) {
                break;
            }
        }

        if (this.filteredDiscrepancies[i]) {
            this.playDiscrepancy(this.filteredDiscrepancies[i]);
        }
    }

    playDiscrepancy(discrepancy) {
        this.wavesurfer.play(discrepancy.start - constants.EXTRA_DISCREPANCY_TIME,
            discrepancy.end + constants.EXTRA_DISCREPANCY_TIME);
    }

    updateSelectedDiscrepancy() {
        var self = this;

        if (!self.discrepancies) return;
        let time = self.wavesurfer.getCurrentTime();

        let oldSelectedDiscrepancy = document.getElementsByClassName('selected-discrepancy')[0];
        if (oldSelectedDiscrepancy) {
            oldSelectedDiscrepancy.classList.remove('selected-discrepancy');
        }

        let i = 0;
        for (; i < self.filteredDiscrepancies.length; i++) {
            if (this.filteredDiscrepancies[i].start - constants.EXTRA_DISCREPANCY_TIME > time) {
                break;
            }
        }

        i--;

        if (i >= 0 && this.filteredDiscrepancies[i].end + constants.EXTRA_DISCREPANCY_TIME > time) {
            let newSelectedDiscrepancy = document.getElementById('discrepancy_' + (i).toString());
            if (newSelectedDiscrepancy) {
                newSelectedDiscrepancy.classList.add('selected-discrepancy');
                // newSelectedDiscrepancy.scrollIntoView();
            }
        }
    }

    updateSelectedWordInFile(fileIndex) {
        var self = this;

        let time = self.wavesurfer.getCurrentTime();

        let region = self.currentRegions[fileIndex];
        if (!region) return;

        let words = region.data.words;
        if (!words) return;

        words.forEach(function (word, i) {
            if (word.start <= time && word.end >= time) {
                let newSelectedWord = document.querySelector(`[word-uuid="${word.uuid}"]`)

                if (newSelectedWord) {
                    newSelectedWord.classList.add('selected-word');
                }
            }
        });
    }

    updateSelectedWordInFiles() {
        // unselect words
        document.querySelectorAll('.selected-word').forEach(function (elem) {
            elem.classList.remove('selected-word');
        });

        for (let i = 0; i < this.filesData.length; i++) {
            this.updateSelectedWordInFile(i);
        }
    }

    getRegion(id) {
        if (!id) {
            return null;
        }

        return this.wavesurfer.regions.list[id];
    }

    iterateRegions(func, fileIndex, sort) {
        var regions = this.wavesurfer.regions.list;

        if (sort) {
            regions = sortDict(regions, 'start');
        }

        Object.keys(regions).forEach(function (key) {
            var region = regions[key];
            if (fileIndex !== undefined && region.data.fileIndex !== fileIndex) {
                return;
            }
            // if (speaker !== undefined && region.data.speaker !== speaker) {
            //     return;
            // }

            func(region);
        });
    }

    // Assuming time is not contained in any region
    findClosestRegionToTime(fileIndex, time, before) {
        var closest = null;
        this.iterateRegions(function (region) {
            if (before) {
                if (region.start < time - 0.01 && (closest === null || region.start > closest.start)) {
                    closest = region;
                }
            } else {
                if (region.end > time && (closest === null || region.end < closest.end)) {
                    closest = region;
                }
            }

        }, fileIndex);

        return closest;
    }

    findClosestRegionToTimeBackward(fileIndex, time) {
        var closest = null;
        this.iterateRegions(function (region) {
            if (region.end < time && (closest === null || region.end > closest.end)) {
                closest = region;
            }
        }, fileIndex);

        return closest;
    }

    createSpeakerLegends() {
        var self = this;

        // First aggregate all speakers, overwrite if "color" field is presented anywhere.
        // We set the same speaker for different files with the same color this way,
        // // determined by the last "color" field or one of the colors in the list
        let speakersColors = Object.assign({}, constants.defaultSpeakers);

        self.filesData.forEach(fileData => {
            let colorIndex = 0;

            if (self.applicationModes.VANILLA) {
              fileData.legend = Object.assign({}, constants.defaultSpeakers);
            }
            else {
              fileData.legend = {};
            }


            fileData.data.forEach(monologue => {
                if (!monologue.speaker.id) return;

                let speakerId = monologue.speaker.id;

                if (speakerId === constants.UNKNOWN_SPEAKER) {
                    speakerId = "";
                }

                let speakers = String(speakerId).split(constants.SPEAKERS_SEPARATOR).filter(x => x);

                // TODO: remove and put colors as metadata outside monologues
                // also, maybe save representativeStart,representativeStart there too
                if (speakers.length === 1) {
                    // forcefully set the color of the speaker
                    if (monologue.speaker.color) {
                        speakersColors[speakerId] = monologue.speaker.color;
                    }
                }

                speakers.forEach(s => {

                    // Encounter the speaker id for the first time (among all files)
                    if (!(s in speakersColors)) {
                        speakersColors[s] = constants.SPEAKER_COLORS[colorIndex];
                        colorIndex = (colorIndex + 1) % constants.SPEAKER_COLORS.length;
                    }
                    fileData.legend[s] = undefined;
                });
            })

            fileData.legend = self.sortLegend(fileData.legend);
        });

        // Set the actual colors for each speaker
        self.filesData.forEach(fileData => {
            Object.keys(fileData.legend).forEach(speaker => {
                fileData.legend[speaker] = speakersColors[speaker];
            });
        });
    }

    addRegions() {
        var self = this;

        self.currentRegions = [];

        self.filesData.forEach((fileData, fileIndex) => {
            let monologues = fileData.data;

            if (!monologues.length) return;

            var last_end = monologues[0].start;

            for (var i = 0; i < monologues.length; i++) {
                var monologue = monologues[i];

                var speakerId = "";
                if (monologue.speaker) {
                  if (self.applicationModes.DIARIZATION){
                    speakerId = monologue.speaker.id.toString();
                  }
                  else if (self.applicationModes.IDENTIFICATION){
                    speakerId = monologue.speaker.id.toString();
                  }
                  else {//default / vanilla
                    speakerId = monologue.speaker.id.toString();
                  }

                  /* TODO : make this work
                  if (monologue.speaker.name !== null){
                    console.log(monologue.speaker);
                    speakerId =monologue.speaker.name.toString();
                  }
                  else {
                    speakerId = monologue.speaker.id.toString();
                  }*/
                }

                if (speakerId === constants.UNKNOWN_SPEAKER) {
                    speakerId = "";
                }

                var start = monologue.start;
                var end = monologue.end;


                // check overlapping with accuracy up to 5 decimal points
                // else if (last_end > start + 0.00001) {
                if (last_end > start + constants.TOLERANCE) {
                    console.error("overlapping monologues. file index: {0} time: {1}".format(fileIndex, last_end.toFixed(2)));
                }

                last_end = end;
                //region.element.innerText = speaker;
                var region = this.wavesurfer.addRegion({
                    start: start,
                    end: end,
                    data: {
                        initFinished: true,
                        fileIndex: fileIndex,
                        speaker: speakerId.split(constants.SPEAKERS_SEPARATOR).filter(x => x), //removing empty speaker
                        words: monologue.words.map((w) => {
                            return {
                                ...w,
                                uuid: uuidv4()
                            }
                        }),
                        distance:monologue.speaker.distance,
                        annotators:monologue.speaker.annotators,
                        non_id:monologue.speaker.non_id
                    },
                    drag: false,
                    resize:self.applicationModes.VANILLA,
                    minLength: constants.MINIMUM_LENGTH
                });

                // if (speakerId === 'EDER') {
                //     region.color = monologue.speaker.color;
                // }

            }

            self.currentRegions.push(undefined);
        })

    }

    splitSegment() {
        if (!this.applicationModes.VANILLA) throw("User should not be able to split segments in "+this.applicationMode+" mode.");
        let region = this.selectedRegion;
        if (!region) return;
        let time = this.wavesurfer.getCurrentTime();

        let first = this.copyRegion(region);
        let second = this.copyRegion(region);

        delete first.id;
        delete second.id;
        first.end = time;
        second.start = time;

        let words = JSON.parse(JSON.stringify(region.data.words));
        let i;
        for (i = 0; i < words.length; i++) {
            if (words[i].start > time) break;
        }

        first.data.words = words.slice(0, i);
        second.data.words = words.slice(i);

        this.__deleteRegion(region);
        first = this.wavesurfer.addRegion(first);
        second = this.wavesurfer.addRegion(second);

        //the list order matters!
        this.undoStack.push([first.id, second.id, region.id])
        this.eventBus.trigger('geckoChanged', {
            event: 'splitSegment',
            data: [first.id, second.id, region.id]
        })
        this.regionsHistory[region.id].push(null);
    }

    deleteRegionAction(region) {
        if (!this.applicationModes.VANILLA) throw("User should not be able to delete regions in "+this.applicationMode+" mode.");

        if (!region) return;

        this.undoStack.push([region.id]);
        this.regionsHistory[region.id].push(null);

        this.__deleteRegion(region);

        this.eventBus.trigger('geckoChanged', {
            event: 'deleteRegion',
            data: region
        })

        this.updateView();
    }

    __deleteRegion(region) {
        if (!region) return;

        var prev = this.getRegion(region.prev);
        if (prev) prev.next = region.next;

        var next = this.getRegion(region.next);
        if (next) next.prev = region.prev;

        this.deselectRegion();
        region.remove();
    }


    setPlaybackSpeed(speed) {
        this.currentPlaybackSpeed = speed;
        this.wavesurfer.setPlaybackRate(speed);
    }

    playPause() {
        if (this.isPlaying) {
            this.wavesurfer.pause()
            this.videoPlayer && this.videoPlayer.pause()
        } else {
            this.wavesurfer.play()
            this.videoPlayer && this.videoPlayer.play()
        }
    }

    playRegion() {
        if (this.selectedRegion) {
            this.selectedRegion.play();
          /*  var region= this.selectedRegion;
            region.on('out', function(e) {
                region.play();
                console.log("logging ",region," on out event");
            });*/
        }
        // play silence region
        else {
            var silence = this.calcSilenceRegion();
            this.wavesurfer.play(silence.start, silence.end);
        }
    }

    calcSilenceRegion() {
        var silence = {start: 0, end: null};
        var afterRegion = this.findClosestRegionToTime(this.selectedFileIndex, this.wavesurfer.getCurrentTime());
        var beforeRegion = this.findClosestRegionToTime(this.selectedFileIndex, this.wavesurfer.getCurrentTime(), true);

        if (afterRegion === null) {
            silence.end = this.wavesurfer.getDuration();
            if (beforeRegion !== null) {
                silence.start = beforeRegion.end;
            }
        } else {
            silence.end = afterRegion.start;
        }

        if (beforeRegion !== null) {
            silence.start = beforeRegion.end;
        }

        return silence;
    }

    toggleAutoCenter() {
        this.wavesurfer.params.autoCenter = !this.wavesurfer.params.autoCenter;
    }


    setCurrentTime() {
        // this.currentTimeSeconds = time;
        this.currentTime = secondsToMinutes(this.wavesurfer.getCurrentTime());
        this.$scope.$evalAsync();
    }


    async save(extension, converter) {
        try {
            await this.dataBase.clearDB()
        } catch (e) {
        }
        for (var i = 0; i < this.filesData.length; i++) {
            var current = this.filesData[i];
            if (current.data) {
                // convert the filename to "rttm" extension
                var filename = current.filename.substr(0, current.filename.lastIndexOf('.')) + "." + extension;

                if (!this.checkValidRegions(i)) return;

                this.dataManager.downloadFileToClient(converter(i), filename);
            }
        }
    }

    async saveS3(extension, converter) {
        try {
            await this.dataBase.clearDB()
        } catch (e) {
        }
        for (var i = 0; i < this.filesData.length; i++) {
            var current = this.filesData[i];
            if (current.data) {
                // convert the filename to "rttm" extension
                var filename = current.filename.substr(0, current.filename.lastIndexOf('.')) + "." + extension;

                if (!this.checkValidRegions(i)) return;

                this.dataManager.saveDataToServer(converter(i), { filename, s3Subfolder: current.s3Subfolder });
            }
        }
    }

    saveDiscrepancyResults() {
        this.dataManager.downloadFileToClient(jsonStringify(this.discrepancies),
            this.filesData[0].filename + "_VS_" + this.filesData[1].filename + ".json");
    }

    saveData() {
        for (var i = 0; i < this.filesData.length; i++) {
            const current = this.filesData[i]
            const splName = current.filename.split('.')
            const extension = splName[splName.length - 1]
            const saveFunction = this.isServerMode ? this.saveS3.bind(this) : this.save.bind(this)
            saveFunction(extension, convertTextFormats(extension, this, config.parserOptions))
        }
    }

    saveClient(extension) {
        for (var i = 0; i < this.filesData.length; i++) {
            this.save(extension, convertTextFormats(extension, this, config.parserOptions))
        }
    }

    checkValidRegions(fileIndex) {
        var self = this;
        try {
            var last_end = 0;
            this.iterateRegions(function (region) {
                if (region.end <= region.start) {
                    throw "Negative duration in file {0}\n Start: {1}\n End: {2}"
                        .format(self.filesData[fileIndex].filename, region.start, region.end);
                }

                if (last_end > region.start + constants.TOLERANCE) {
                    throw "Overlapping in file: {0}. \n Time: {1}".format(self.filesData[fileIndex].filename, last_end.toFixed(2));
                }
                last_end = region.end;
            }, fileIndex, true)
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Check regions error',
                text: err
            })
            return false;
        }
        return true;
    }

    formatSpeaker(speaker) {
        var ret = "";

        if (speaker.length === 0) {
            ret = constants.UNKNOWN_SPEAKER;
        } else {
            ret = speaker.join(constants.SPEAKERS_SEPARATOR);
        }

        return ret;
    }

    splitPunctuation(text) {
        let punct = "";

        while (constants.PUNCTUATIONS.indexOf(text[text.length - 1]) !== -1) {
            punct = text[text.length - 1] + punct;
            text = text.substring(0, text.length - 1)
        }

        if (punct === '...') {
            punct = '…';
        }

        return [text, punct];
    }

    textareaBlur() {
        if (this.isTextChanged) {
            this.addHistory(this.selectedRegion);
            this.undoStack.push([this.selectedRegion.id]);
            this.isTextChanged = false;
        }
    }

    textChanged() {
        this.isTextChanged = true;
    }

    speakerChanged(speaker) {
        if (this.applicationModes.IDENTIFICATION) throw("User should not be able to change segment id in "+this.applicationMode+" mode.");

        var self = this;

        var speakers = self.selectedRegion.data.speaker;
        var idx = speakers.indexOf(speaker);

        // Is currently selected
        if (idx > -1) {
            //deep copy selected region before we modify anything
            self.deselectedRegion=self.copyRegion(self.selectedRegion);
            speakers.splice(idx, 1);
            //user deselected speaker -> add to non_id
            self.selectedRegion.data.non_id.push(speaker)
        }
        // Is newly selected
        else {
            speakers.push(speaker);
        }
        self.addHistory(self.selectedRegion);
        self.undoStack.push([self.selectedRegion.id]);
        this.eventBus.trigger('geckoChanged', {
            event: 'speakerChanged',
            data: speaker
        })
        this.regionUpdated(self.selectedRegion);
    }

    speakerNameChanged(oldText, newText) {
        if (this.applicationModes.DIARIZATION) throw("User should not be able to change cluster id in "+this.applicationMode+" mode.");

        let self = this;

        //console.log(oldText, newText);

        var newColor = "#a94dec";//in case something goes wrong ?
        var oldColor = self.filesData[self.selectedFileIndex].legend[oldText];//save in case we have to undo
        if (self.filesData[self.selectedFileIndex].legend[newText] !== undefined){
            if (this.applicationModes.VANILLA){
                return false;
            }
            else { //we don't care that there are duplicate speakers
                newColor=self.filesData[self.selectedFileIndex].legend[newText];
            }
         }
        self.updateLegend(self.selectedFileIndex, oldText, newText);

        let changedRegions = [];
        self.iterateRegions(region => {
            let index = region.data.speaker.indexOf(oldText);
            if (index > -1) {
                if (this.applicationModes.IDENTIFICATION){
                  //TODO: sometimes doesn't work for some reason
                  self.changeSpeakerColor(index, newText, newColor);
                }
                region.data.speaker[index] = newText;
                self.addHistory(region);
                changedRegions.push(region.id);
                //self.regionUpdated(region);
            }
        }, self.selectedFileIndex);

        // notify the undo mechanism to change the legend as well as the regions
        self.undoStack.push([constants.SPEAKER_NAME_CHANGED_OPERATION_ID, self.selectedFileIndex, oldText, newText,oldColor, changedRegions]);
        this.eventBus.trigger('geckoChanged', {
            event: 'speakerNameChanged',
            data: [self.selectedFileIndex, oldText, newText,oldColor, changedRegions]
        })
    }

    updateLegend(fileIndex, oldSpeaker, newSpeaker) {
        let self = this;
        let fileData = self.filesData[fileIndex];

        fileData.legend[newSpeaker] = fileData.legend[oldSpeaker];
        delete fileData.legend[oldSpeaker];
        fileData.legend = self.sortLegend(fileData.legend);
    }

    newSpeakerKeyUp(e) {
        if (e.keyCode === 13) {
            this.addSpeaker();
        }
    }

    addSpeaker(color) {
      /*
      * adds a new speaker and assigns it a color.
      * color defaults to constants.SPEAKER_COLORS[amountOfSpeakers] if undefined
      */
        //if (!this.applicationModes.VANILLA) throw("User should not be able to add speakers in "+this.applicationMode+" mode.");

        // var speakerNameElement = document.getElementById('newSpeakerName');

        let legend = this.filesData[this.selectedFileIndex].legend;
        //console.log(this.newSpeakerName);

        if (this.newSpeakerName === '' || this.newSpeakerName in legend) return;

        // Add speaker to legend and assign random color
        const amountOfSpeakers = Object.keys(legend).length;// - Object.keys(constants.defaultSpeakers).length;
        if (color===undefined){
          legend[this.newSpeakerName] =constants.SPEAKER_COLORS[amountOfSpeakers];
        }
        else{
          legend[this.newSpeakerName] = color;

        }

        this.filesData[this.selectedFileIndex].legend = this.sortLegend(legend);

        this.newSpeakerName = "";
        //console.log(legend);
    }

    sortLegend(legend) {
        return sortDict(legend, undefined, function (a, b) {
                if (a in constants.defaultSpeakers && !(b in constants.defaultSpeakers)) {
                    return 1;
                }
                if (b in constants.defaultSpeakers && !(a in constants.defaultSpeakers)) {
                    return -1;
                }

                return a < b ? -1 : 1;
            }
        );
    }

// WARNING: Does not work well. after resize there's a dragging problem for regions
// resizeWavesurfer(e) {
//     var currentHeight = e.currentTarget.offsetHeight - 10;
//
//     if (this.previousHeight && currentHeight !== this.previousHeight) {
//         this.previousHeight = currentHeight;
//         this.wavesurfer.setHeight(currentHeight);
//     }
// }

    changeSpeakerColor(fileIndex, speaker, color) {
        var self = this;

        self.filesData[fileIndex].legend[speaker] = color;

        this.iterateRegions(function (region) {
            if (region.data.speaker.indexOf(speaker) > -1) {
                //region.color = color;
                self.regionUpdated(region);
            }
        }, fileIndex);
    }

    loadServerMode(config) {
        var self = this;

        if (self.wavesurfer) self.wavesurfer.destroy();
        self.init();

        this.dataManager.loadFileFromServer(config).then(function (res) {
            // var uint8buf = new Uint8Array(res.audioFile);
            // self.wavesurfer.loadBlob(new Blob([uint8buf]));
            self.wavesurfer.loadBlob(res.audioFile);
            self.audioFileName = res.audioFileName;
            res.segmentFiles.forEach(x => x.data = self.handleTextFormats(x.filename, x.data));
            self.filesData = res.segmentFiles;
        })
    }

    //TODO: move all that to a different file
    loadClientMode() {
        var self = this;
        var modalInstance = this.$uibModal.open({
            templateUrl: audioModalTemplate,
            backdrop: 'static',
            controller: async ($scope, $uibModalInstance, $timeout, zoom) => {
                $scope.draftAvailable = false
                const draftCounts = await this.dataBase.getCounts()
                if (draftCounts) {
                    self.$timeout(() => {
                        $scope.draftAvailable = true
                    })
                }
                $scope.runDemo = async () => {
                    const demoFile = {
                        filename: 'demo.json',
                        data: self.handleTextFormats('demo.json', JSON.stringify(demoJson))
                    }

                    self.filesData = [
                        demoFile
                    ];
                    await this.dataBase.addFile({
                        fileName: demoFile.filename,
                        fileData: demoFile.data
                    })
                    self.audioFileName = 'demo.mp3';
                    self.init();
                    const res = await this.dataManager.loadFileFromServer({
                        audio: {
                            url: 'https://raw.githubusercontent.com/gong-io/gecko/master/samples/demo.mp3'
                        },
                        ctms: []
                    })
                    this.dataBase.addMediaFile({
                        fileName: self.audioFileName,
                        fileData: res.audioFile
                    })
                    self.wavesurfer.loadBlob(res.audioFile);
                    $uibModalInstance.close(false);
                };

                $scope.loadDraft = async () => {
                    self.init()
                    const audio = self.dataBase.getLastMediaFile()
                    const files = self.dataBase.getFiles()
                    const res = await Promise.all([ audio, files ])
                    self.loadFromDB(res)

                    $uibModalInstance.close(false);
                };

                $scope.newSegmentFiles = [undefined];

                $scope.ok = function () {
                    // Take only selected files
                    var segmentsFiles = [];
                    for (var i = 0; i < $scope.newSegmentFiles.length; i++) {
                        var current = $scope.newSegmentFiles[i];
                        if (current && current.name && current.name !== "") {
                            segmentsFiles.push(current);
                        }
                    }

                    var call_from_url;
                    if ($scope.chosen_call_id) {
                        if ($scope.chosen_call_id.length !== 1) {
                            Swal.fire({
                                icon: 'warning',
                                title: 'Please choose only one call'
                            })
                            return;
                        }
                        call_from_url = $scope.chosen_call_id[0];
                    }

                    $uibModalInstance.close({
                        audio: $scope.newAudioFile,
                        call_from_url: call_from_url,
                        segmentsFiles: segmentsFiles,
                        zoom: $scope.zoom
                    });
                };

                $scope.zoom = zoom;

                $scope.selectAudio = function () {
                    inputAudio.value = "";
                    inputAudio.click();
                };

                $scope.loadUrls = function () {
                    var filename = $scope.newAudioFile.name;
                    var ext = filename.substr(filename.lastIndexOf('.') + 1);
                    if (ext === 'json') {
                        var reader = new FileReader();

                        var self = this;
                        reader.onload = function (e) {
                            $scope.$evalAsync(function () {
                                $scope.call_urls = JSON.parse(e.target.result)
                                    .map(function (x) {
                                        var k = Object.keys(x)[0];
                                        return {'id': k, 'url': x[k]}
                                    });
                            });
                        };

                        reader.readAsText($scope.newAudioFile);
                    } else {
                        $scope.$evalAsync(function () {
                            $scope.call_urls = undefined;
                            $scope.chosen_call_id = undefined;
                        });
                    }
                };


                $scope.selectTextFile = function (id) {
                    var inputElement = document.getElementById(id);
                    inputElement.value = "";
                    inputElement.click();
                }

                $scope.addFileSlot = function () {
                    $timeout(function () {
                        if ($scope.newSegmentFiles[$scope.newSegmentFiles.length - 1] !== undefined) {
                            $scope.newSegmentFiles.push(undefined);
                        }
                    });
                }

                $scope.handleMultiple = function (extra_files) {
                    $scope.newSegmentFiles = $scope.newSegmentFiles.concat(extra_files);
                }

                $scope.cancel = function () {
                    $uibModalInstance.dismiss('cancel');
                };

                $scope.$watch('newAudioFile', (newVal) => {
                    if (!newVal) {
                        return
                    }
                    const reader = new FileReader()
                    reader.onload = function (event) {
                        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        try {
                            audioContext.decodeAudioData(event.target.result).then((buffer) => {
                            }).catch(e => {
                                Swal.fire({
                                    icon: 'warning',
                                    title: 'Audio decoding error',
                                    text: e
                                })
                            });
                        } catch (e) {
                            Swal.fire({
                                icon: 'warning',
                                title: 'Audio decoding error',
                                text: e
                            })
                        }
                    };
                    reader.readAsArrayBuffer(newVal)
                })
            },
            resolve: {
                zoom: function () {
                    return constants.ZOOM;
                }
            }
        });

        modalInstance.result.then(function (res) {
            if (res) {
                if (self.wavesurfer) self.wavesurfer.destroy();
                self.init();
                self.parseAndLoadAudio(res);
            }
        });
    }

    async parseAndLoadAudio(res) {
        var self = this;
        if (res.call_from_url) {
            self.audioFileName = res.call_from_url.id;
            self.wavesurfer.load(res.call_from_url.url);
            self.parseAndLoadText(res);
        } else {
            const fileResult = await this.readMediaFile(res.audio)
            this.parseAndLoadText(res);
            await this.dataBase.clearDB()
            if (!this.videoMode) {
                this.dataBase.addMediaFile({
                    fileName: this.audioFileName,
                    fileData: fileResult
                })
                try {
                    this.wavesurfer.loadBlob(fileResult);
                } catch (e) {
                    console.log('error', e)
                }
            } else {
                this.dataBase.addMediaFile({
                    fileName: this.audioFileName,
                    fileData: res.audio,
                    isVideo: true
                })
                this.videoPlayer = videojs('video-js')
                this.videoPlayer.ready(function () {
                    var fileUrl = URL.createObjectURL(res.audio);
                    var fileType = res.audio.type;
                    this.src({ type: fileType, src: fileUrl });
                    this.load();
                    this.muted(true)
                })
                this.wavesurfer.loadDecodedBuffer(fileResult);
            }
        }

    }

    async loadFromDB (res) {
        const mediaFile = res[0]
        const files = res[1]

        if (files && files.length) {
            this.filesData = files.map((f) => {
                return {
                    filename: f.fileName,
                    data: f.fileData
                }
            })
        } else {
            this.filesData = []
        }

        if (mediaFile) {
            this.audioFileName = mediaFile.fileName
            if (!mediaFile.isVideo) {
                this.wavesurfer.loadBlob(mediaFile.fileData)
            } else {
                const fileResult = await this.readVideoFile(mediaFile.fileData)
                this.videoPlayer = videojs('video-js')
                this.videoPlayer.ready(function () {
                    var fileUrl = URL.createObjectURL(mediaFile.fileData);
                    var fileType = mediaFile.fileData.type;
                    this.src({ type: fileType, src: fileUrl });
                    this.load();
                    this.muted(true)
                })
                this.wavesurfer.loadDecodedBuffer(fileResult)
            }
        }
    }

    parseAndLoadText(res) {
        var self = this;
        self.filesData = []

        var i = 0;

        // force recursion in order to keep the order of the files
        const cb = async (data) => {
            const file = {filename: res.segmentsFiles[i].name, data}
            self.filesData.push(file);
            await this.dataBase.addFile({
                fileName: file.filename,
                fileData: file.data
            })
            i++;
            if (i < res.segmentsFiles.length) {
                self.readTextFile(res.segmentsFiles[i], cb);
            }
        }

        if (i < res.segmentsFiles.length) {
            self.readTextFile(res.segmentsFiles[i], cb);
        } else {
            var filename = self.audioFileName.substr(0, self.audioFileName.lastIndexOf('.')) + ".txt";
            if (filename === ".txt") {
                filename = self.audioFileName + ".txt";
            }
            self.filesData.push(
                {
                    filename: filename,
                    data: []
                }
            );
        }
    }

    handleTextFormats(filename, data) {
        return parseTextFormats(filename, data, this, config.parserOptions)
    }

    readAudioFile (file) {
        return new Promise((resolve, reject) => {
            resolve(file)
        })
    }

    readVideoFile (file) {
        const self = this
        return new Promise(async (resolve, reject) => {
            this.audioFileName = file.name;
            var reader = new FileReader();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)()
            reader.onload = function () {
                var videoFileAsBuffer = reader.result
                audioContext.decodeAudioData(videoFileAsBuffer).then(function (decodedAudioData) {
                    self.videoMode = true
                    resolve(decodedAudioData)
                })
            }
            reader.readAsArrayBuffer(file)
        })
    }

    async readMediaFile(file) {
        return new Promise(async (resolve, reject) => {
            this.audioFileName = file.name;
            if (file.type.includes('audio')) {
                const result = await this.readAudioFile(file)
                resolve(result)
            } else if (file.type.includes('video')) {
                const result = await this.readVideoFile(file)
                resolve(result)
            }
        })
    }

    readTextFile(file, cb) {
        // check for empty file object
        if (Object.keys(file).length === 0 && file.constructor === Object) {
            cb(undefined);
            return;
        }
        var reader = new FileReader();

        var self = this;
        reader.onload = function (e) {
            const result = self.handleTextFormats(file.name, e.target.result)
            cb(result);
        };

        reader.readAsText(file);
    }

    initAudioContext() {
        var context;

        try {
            // Fix up for prefixing
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            context = new AudioContext();
        } catch (e) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Web Audio API is not supported in this browser'
            })
        }

        this.audioContext = context;


    }

    openShortcutsInfo() {
        var self = this;
        var modalInstance = this.$uibModal.open({
            templateUrl: shortcutsInfoTemplate,
            controller: function ($scope, $uibModalInstance) {
                $scope.ok = function () {
                    $uibModalInstance.close();
                };
                $scope.shortcuts = self.shortcuts.getInfo()
            }
        });
    }

    seek(time, leanTo) {
        let offset = 0;

        if (leanTo === 'right'){
            offset =  0.0001;
        }
        else if(leanTo === 'left'){
            offset = - 0.0001;
        }

        this.wavesurfer.seekTo((time + offset) / this.wavesurfer.getDuration());
    }

    editableKeysMapping(regionIndex, wordIndex, keys, which) {
        const currentRegion = this.currentRegions[regionIndex];
        const words = currentRegion.data.words;

        if (keys === 'space') {
            this.playPause()
        } else if (keys === 'ArrowRight') {
            let nextIndex = wordIndex + 1;
            if (nextIndex < words.length) {
                const nextWord = document.getElementById(`word_${regionIndex}_${nextIndex}`);
                nextWord.focus();
                // this.seek(words[nextIndex].start, 'right');
            } else {
                var nextRegion = this.getRegion(currentRegion.next);
                if (nextRegion) {
                    this.seek(nextRegion.data.words[0].start, 'right');
                    this.$timeout(() => {
                        const nextWord = document.getElementById(`word_${regionIndex}_0`)
                        if (nextWord) {
                            nextWord.focus()
                        }
                    })
                }
            }
        } else if (keys === 'ArrowLeft') {
            let prevIndex = wordIndex - 1
            if (prevIndex >= 0) {
                const prevWord = document.getElementById(`word_${regionIndex}_${prevIndex}`)
                prevWord.focus()
                // this.seek(words[prevIndex].start, 'right');
            } else {
                var prevRegion = this.getRegion(currentRegion.prev);
                if (prevRegion) {
                    const lastIndex = prevRegion.data.words.length - 1;
                    this.seek(prevRegion.data.words[lastIndex].start, 'right');
                    this.$timeout(() => {
                        const prevWord = document.getElementById(`word_${regionIndex}_${lastIndex}`)
                        if (prevWord) {
                            prevWord.focus()
                        }
                    })
                }
            }
        } else if (keys === 'alt_space') {
            this.playRegion()
        } else if (which === 219) {
            this.wavesurfer.skip(-5)
        }
    }

    toggleSpectrogram () {
        if (!this.spectrogramReady) {
            this.wavesurfer.initPlugin('spectrogram')
            this.spectrogramReady = true
        }
        this.showSpectrogram = !this.showSpectrogram
    }
}

MainController
    .$inject = ['$scope', '$uibModal', 'dataManager', 'dataBase', '$timeout','$interval', 'eventBus'];
export {
    MainController
}
