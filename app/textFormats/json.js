import * as constants from '../constants'
import { jsonStringify } from '../utils'

export const parse = (data) => {
    if (typeof data === 'string') {
        data = JSON.parse(data)
    }

    var monologues = data['monologues'];
    for (var i = 0; i < monologues.length; i++) {
        var monologue = monologues[i];


        if (!monologue.speaker) {
            // monologue.speaker = {id: constants.UNKNOWN_SPEAKER};
            monologue.speaker = "";
        }

        if (monologue.start === undefined) monologue.start = monologue.terms[0].start;
        if (monologue.end === undefined) monologue.end = monologue.terms.slice(-1)[0].end;


        // if (!monologue.text && monologue.terms) {
        //     monologue.text = "";
        //     for (var t = 0; t < monologue.terms.length; t++) {
        //         var term = monologue.terms[t];
        //         if (term.text) {
        //             if (term.type === "WORD") {
        //                 monologue.text += " ";
        //             }
        //
        //             monologue.text += term.text;
        //         }
        //     }
        // }


        if (monologue.terms) {
            monologue.words = monologue.terms;
            delete monologue.terms;
        } else {
            monologue.words = [];
        }


        // attach punctuation to the previous word
        for (let j = 1; j < monologue.words.length;) {
            let current = monologue.words[j];

            if (current.type === constants.PUNCTUATION_TYPE) {
                monologue.words[j - 1].text += current.text;
                monologue.words.splice(j, 1);
            } else {
                j++;
            }
        }
    }
    return monologues;
}

export const convert = (app, fileIndex) => {
    var self = app;
    var data = {schemaVersion: "3.0", monologues: []};
    app.iterateRegions(function (region) {
        let words = region.data.words;
        let terms = []
        if (words) {
            words.forEach(w => {
                // copy word to cancel references
                let t = JSON.parse(JSON.stringify(w))

                t.type = constants.WORD_TYPE;
                terms.push(t);

                let textAndPunct = self.splitPunctuation(t.text);
                if (textAndPunct[1] !== "") {

                    //trim the punctuation from the original
                    t.text = textAndPunct[0]

                    terms.push({
                        start: t.end,
                        end: t.end,
                        text: textAndPunct[1],
                        confidence: t.confidence,
                        type: constants.PUNCTUATION_TYPE
                    })
                }
            })
        }
        var newSpeaker={
          id : self.formatSpeaker(region.data.speaker),
          segment : region.data.segment,
          cluster : region.data.cluster,
          color : region.color
        }
        if (self.applicationModes.DIARIZATION){
          newSpeaker.segment.id=newSpeaker.id;
          newSpeaker.segment.annotators++;
        }
        else if (self.applicationModes.IDENTIFICATION){
          newSpeaker.cluster.id=newSpeaker.id;
          newSpeaker.cluster.annotators++;
        }
        data.monologues.push({
            speaker: newSpeaker,
            start: region.start,
            end: region.end,
            terms: terms
        });

    }, fileIndex, true);

    return jsonStringify(data);
}
