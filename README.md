# Gecko - A Tool for Effective Annotation of Human Conversations

![Comparison](./docs/Comparison.png)

 Gecko allows efficient and effective segmentation of the voice signal by speaker as well as annotation of the linguistic content of the conversation. A key feature of Gecko is the presentation of the output of automatic segmentation and transcription systems in an intuitive user interface for editing. Gecko allows annotation of Voice Activity Detection (VAD), Diarization, Speaker Identiﬁcation and ASR outputs on a large scale, and leads to faster and more accurate annotated datasets.

 For an overview of the main features, see this [video](https://youtu.be/CBYA0YC1NBI) and the corresponding [paper](./docs/gecko_interspeech_2019_paper.pdf). \
 You can also play with the online [working platform](https://gong-io.github.io/gecko/).

## Pyannote fork

[Pyannote](https://github.com/pyannote/) aims for two applications :
- [Diarization](https://docs.google.com/drawings/d/13AS2uW2bVSBcuByzQjBV56xpVXYapeUsEr6FETw2tLQ/edit?usp=sharing), which allows the user to correct segments wrongly assigned to a cluster.
- [Identification](https://docs.google.com/drawings/d/12vUuOFxWfXZxM5qe1yDWV85nE8UFHDjQnC2yXVOUS-E/edit), which allows the user to correct the cluster label of a wrongly identified cluster.

Both applications will make use of clustering and active learning for a faster annotation process.  
The different `APPLICATION_MODE` are defined in `app/constants.js` and the user is able to switch `applicationMode` using a dropdown menu binded to the `resetApplicationMode` function.

Two features are currently being implemented, see issues [#27](i27) and [#28](i28).


## Features
* Supports the annotating process of different stages of a conversation: voice detection, diarization, identification and transcription.
* Provides an efficient and convenient tool for annotating audio files.
* Visualize the annotation of several different sources at once.
* Refine existing annotation files
* Compare different annotating files to find discrepancies between different systems or annotators.
* No server side is needed - easy installation.
* Supports different formats such as RTTM, CTM, JSON, SRT.
* Increased productivity using keyboard shortcuts

## Technological Stack
Gecko is written in Javascript and is based on Angular.js V1.X.
 The audio player uses the popular [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) library.


## Deployment and Installation
See [this page](INSTALLATION.md).

## Publications
Gecko was presented in Interspeech 2019, the world's leading Speech Technology conference. See this [video](https://youtu.be/CBYA0YC1NBI) for an overview and the accepted [paper](./docs/Gecko_intersepeech2019_proposal.pdf).

## Citation
If you use `Gecko` please use the following

```bibtex
    @inproceedings{Gecko2019,
      Author = {Golan Levy, Raquel Sitman, Ido Amir, Eduard Golshtein, Ran Mochary, Eilon Reshef, Reichart, Omri Allouche},
      Title = {GECKO - A Tool for Effective Annotation of Human Conversations},
      Booktitle = {20th Annual Conference of the International Speech Communication Association, Interspeech 2019},
      Year = {2019},
      Month = {September},
      Address = {Herzliya, Israel},
      Url = {https://github.com/gong-io/gecko/blob/master/docs/gecko_interspeech_2019_paper.pdf}
    }
```

## Contribution
See [this page](CONTRIBUTING.md).

## Contact

For help and feedback, please feel free to contact [the team at Gong.io](https://github.com/gong-io).
