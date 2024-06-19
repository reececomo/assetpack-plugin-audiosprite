# 🙉 assetpack-plugin-audiosprite [![NPM version](https://img.shields.io/npm/v/assetpack-plugin-audiosprite.svg?style=flat-square)](https://www.npmjs.com/package/assetpack-plugin-audiosprite)

[AssetPack](https://github.com/pixijs/assetpack) plugin for generating audio sprites using [audiosprite](https://github.com/tonistiigi/audiosprite).

### Installation

```
npm install assetpack-plugin-audiosprite --save-dev
```

> [!IMPORTANT]
> Requires `ffmpeg` to be installed in PATH

> [!NOTE]
> Using a fork of `audiosprite`? Just switch to the `v0.8.0+custom-audiosprite` branch:
>
> ```js
> "devDependencies": {
>   "assetpack-plugin-audiosprite": "reececomo/assetpack-plugin-audiosprite#v0.8.0+custom-audiosprite",
>   "audiosprite": "<your fork goes here>",
>   // ...
> },
> ```

## Basic usage

Use the `{audiosprite}` tag (or set your own) to combine a directory of audio files into a single audiosprite.

```js
// .assetpack.js
const { audiosprite } = require('assetpack-plugin-audiosprite');

module.exports = {
  entry: './raw-assets/',
  output: './assets/',

  plugins: {
    audiosprite: audiosprite(),
  },
};
```

### Options

```js
audiosprite({
  // use a custom tag  (default: 'audiosprite')
  tags: { audiosprite: 'sfx' },

  // whether assets are nested in their namespace "abc/abc.json" (default: true)
  nested: false,

  // limit which sound files should be imported
  imports: ['aac', 'ac3', 'aiff', 'caf', 'flac', 'mp3',
            'mp4', 'm4a', 'ogg', 'opus', 'wav', 'webm'],

  // modify emitted JSON data
  outputJson: {
    path: undefined,
    extension: '.json',
    minify: true,
    transform: (jsonData, jsonPath, resourcePaths) => jsonData,
  },

  // any option that can be passed to Audiosprite can be passed here.
  audiosprite: {
    export: 'ogg,mp3',
    bitrate: 64,
    samplerate: 32_000,
    channels: 1,
    // ...
  }
})
```

## Example - [PixiJS SoundSprite](https://pixijs.io/sound/docs/SoundSprite.html)

Given these files:

```
assets/
  sound_effects{audiosprite}/
    cry.wav
    laugh.mp3
    sneeze.ogg
```

You can import packed assets like so:

```ts
import { Assets } from 'pixi.js';

// load assets
const myJson = await Assets.load('assets/sound_effects.json');
const mySound = await Assets.load('assets/sound_effects.{ogg,m4a,mp3,ac3}');
mySound.addSprites(myJson.spritemap);

// play sounds
mySound.play('cry');
```

> [!IMPORTANT]
> Combine with the `sound` utility from `@pixi/sound` for features like independent volume control.

```ts
import { sound } from '@pixi/sound';

// or use @pixi/sound 'sound' for features like independent volume control
sound.add('sound_effects', mySound);
sound.play('sound_effects', {
  sprite: 'cry',
  volume: 0.5,
});
```
