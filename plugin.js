const util = require('util');
const fs = require('fs');
const _audiosprite = require('audiosprite');
const { hasTag, path, SavableAssetCache } = require('@assetpack/core');
const glob = require('glob-promise');


const DEFAULT_IMPORTS_EXTENSIONS = ['aac', 'ac3', 'aiff', 'caf', 'flac', 'mp3', 'mp4', 'm4a', 'ogg', 'opus', 'wav', 'webm'];

/**
 * AssetPack plugin for generating audio sprites using Audiosprite/FFmpeg [tonistiigi/audiosprite](https://github.com/tonistiigi/audiosprite)
 *
 * ### Basic Usage
 *
 * @example
 * audiosprite: audiosprite({
 *   tag: 'my-custom-tag',
 *   audiosprite: {
 *     // Any option that can be passed to Audiosprite can be passed here.
 *     export: 'ogg,m4a,mp3',
 *     bitrate: 64,
 *     samplerate: 32_000,
 *   },
 * })
 *
 * @param {Object} [options]
 * @param {string} [options.tag]
 * @param {boolean} [options.nested]
 * @param {string[]} [options.imports]
 *
 * @param {Object} [options.outputJson]
 * @param {string} [options.outputJson.path]
 * @param {'.json' | string} [options.outputJson.extension]
 * @param {boolean} [options.outputJson.minify]
 * @param {(json: JSON, jsonPath: string, resourcePaths: string[]) => JSON} [options.outputJson.transform]
 *
 * @param {Object} [options.audiosprite]
 * @param {'jukebox' | 'howler' | 'howler2' | 'createjs'} [options.audiosprite.export]
 * @param {any} [options.audiosprite.autoplay]
 * @param {string[]} [options.audiosprite.loop]
 * @param {number} [options.audiosprite.silence]
 * @param {number} [options.audiosprite.gap]
 * @param {number} [options.audiosprite.minlength]
 * @param {number} [options.audiosprite.bitrate]
 * @param {number} [options.audiosprite.vbr]
 * @param {number} [options.audiosprite.vbr:vorbis]
 * @param {number} [options.audiosprite.samplerate]
 * @param {number} [options.audiosprite.channels]
 * @param {string} [options.audiosprite.rawparts]
 * @param {number} [options.audiosprite.ignorerounding]
 * @param {any}    [options.audiosprite.logger]
 *
 * @returns {Object}
 */
function audiosprite(options) {
  const defaultOptions = {
    tag: 'audiosprite',
    imports: DEFAULT_IMPORTS_EXTENSIONS,
    nested: true,
    outputJson: {
      path: undefined, // same as output dir unless specified
      extension: '.json',
      minify: false,
      transform: undefined,
    },
    audiosprite: {
      // audiosprite overrides:
      output: undefined, // same as output dir unless specified

      // audiosprite defaults:
      path: '',
      export: 'ogg,m4a,mp3,ac3',
      format: 'jukebox',
      autoplay: null,
      loop: [],
      silence: 0,
      gap: 1,
      minlength: 0,
      bitrate: 128,
      vbr: -1,
      'vbr:vorbis': -1,
      samplerate: 44100,
      channels: 1,
      rawparts: '',
      ignorerounding: 0,
      ...options?.audiosprite,
    },
  };
  
  return {
    name: 'audiosprite',
    folder: true,
    test: (tree, _p, opts) => hasTag(tree, 'file', opts.tag || defaultOptions.tag),

    async transform(tree, processor, opts) {
      const outputPath = processor.inputToOutput(tree.path);

      // options
      const tag = opts.tag || defaultOptions.tag;
      const nested = opts.nested ?? defaultOptions.nested;
      const importsFormats = (opts?.imports ?? defaultOptions.imports).join(',').replace(/\./, '');
      const jsonOpts = { ...defaultOptions.outputJson, ...opts.outputJson };
      const audiospriteOpts = {
        ...defaultOptions.audiosprite,
        output: nested ? path.join(outputPath, path.basename(outputPath)) : outputPath,
        ...opts.audiosprite,
      };
      
      // get files
      const globPath = `${tree.path}/**/*.{${importsFormats}}`;
      const files = await glob(globPath);
      if (files.length === 0) return;
      
      // generate
      const json = await audiospriteAsync(files, audiospriteOpts);
      if (!json.resources) {
        throw new Error("Audiosprite emitted malformed JSON. Key 'resources' is required.")
      }

      // get paths
      const jsonFile = path.join(audiospriteOpts.path, audiospriteOpts.output + '.json');
      const audioFiles = json.resources
        .map(file => file.includes('/') ? path.join(audiospriteOpts.path, file) : file);
      const emitted = [jsonFile, ...audioFiles];

      // post-process JSON
      const outs = await processAudiospriteFiles(emitted, {
        processor,
        json,
        jsonOpts,
      });

      /** @type {Map<string, TransformDataFile>} */
      const cacheMap = new Map();

      for (const out of outs) {
        if (out.endsWith(jsonOpts.extension)) {
            if (!cacheMap.get(out)) {
              cacheMap.set(out, {
                paths: [],
                name: processor.trimOutputPath(out),
              });
            }

            const d = cacheMap.get(out);

            d.paths.push(processor.trimOutputPath(out));
            cacheMap.set(out, d);
        }

        processor.addToTree({
          tree,
          transformId: tag,
          outputOptions: {
            outputPathOverride: out,
          },
          transformData: {}
        });
      }

      SavableAssetCache.set(tree.path, {
        tree,
        transformData: {
          type: 'audiosprite',
          files: [...cacheMap.values()],
        }
      });
    },
  };
}

/**
 * Promise wrapper for `audiosprite(..., callback)`
 *
 * @param {string[]} files
 * @param {Object} [opts]
 */
const audiospriteAsync = util.promisify(_audiosprite);

/**
 * Do any post-processing on emitted files here.
 *
 * @param {string[]} files 
 * @param {Object} opts
 * @param {*} opts.processor
 * @param {JSON} opts.jsonOutput
 * @param {boolean} opts.minifyJson
 * @param {(json: JSON, filePath: string) => JSON} opts.transform
 *
 * @returns {Promise<string[]>}
 */
async function processAudiospriteFiles(files, {
  processor,
  json,
  jsonOpts,
}) {
  const outputFilePaths = [];
  
  for (const outputPath of files) {
    if (outputPath.split('.').pop() !== 'json') {
      // Audiosprite emits these directly
      outputFilePaths.push(outputPath);

      continue;
    }

    // rename
    const outDir = jsonOpts.path ?? path.dirname(outputPath);
    const outName = outputPath.split('/').pop().replace('.json', jsonOpts.extension);
    const outputPathOverride = path.join(outDir, outName);

    // replace absolute paths
    const resourcePaths = json.resources;
    json.resources = resourcePaths.map(absPath => absPath.split('/').pop());

    // apply any custom JSON transforms here
    if (jsonOpts.transform) {
      json = jsonOpts.transform(json, outputPathOverride, resourcePaths);
    }

    // emit output
    processor.saveToOutput({
      tree: undefined,
      outputOptions: {
        outputPathOverride: outputPathOverride,
        outputData: JSON.stringify(json, null, jsonOpts.minify ? undefined : 2),
      }
    });

    // rm original, if renamed
    if (outputPathOverride !== outputPath) {
      fs.unlinkSync(outputPath);
    }

    outputFilePaths.push(outputPathOverride);
  }

  return outputFilePaths;
}

module.exports = {
  audiosprite,
};
