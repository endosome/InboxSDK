import fs from 'node:fs';
import path from 'node:path';
import gulp from 'gulp';
import webpack from 'webpack';
import stdio from 'stdio';
import extReloader from './live/extReloader';
import fg from 'fast-glob';
import exec from './src/build/exec';
import { buildExamples } from '@calendarsdk/examples/build';

const sdkFilename = 'calendarsdk';

const args = stdio.getopt({
  // --watch is a node flag that doesn't seem to work after Node 18.12 with gulp.
  // using -w seems to work though.
  watch: { key: 'w', description: 'Automatic rebuild' },
  reloader: { key: 'r', description: 'Automatic extension reloader' },
  hot: { key: 'h', description: 'hot module replacement' },
  minify: { key: 'm', description: 'Minify build' },
  production: { key: 'p', description: 'Production build' },
  noExamples: {
    description: `Don't build examples/ extensions`,
  },
})!;

// --watch causes webpack to use full paths in module references. We don't
// want those visible in production.
if (args.production && args.watch) {
  throw new Error('--production can not be used with --watch');
}

process.env.NODE_ENV = args.production ? 'production' : 'development';

gulp.task('noop', () => {
  // This task exists so we can run `yarn gulp noop` to check that this
  // script loads without any side effects.
});

async function getVersion(): Promise<string> {
  const results = await Promise.all([
    exec('git rev-list HEAD --max-count=1'),
    exec('git status --porcelain'),
  ]);
  const commit = results[0].toString().trim().slice(0, 16);
  const isModified = /^\s*M/m.test(results[1].toString());

  const packageJson = JSON.parse(
    await fs.promises.readFile(
      path.join(__dirname, 'packages/core/package.json'),
      'utf8',
    ),
  );

  let version = `${packageJson.version}-${Date.now()}-${commit}`;
  if (isModified) {
    version += '-MODIFIED';
  }
  if (args.watch) {
    version += '-WATCH';
  }
  return version;
}

const enum OutputLibraryType {
  UMD = 'umd',
}

interface WebpackTaskOptions {
  entry: webpack.Configuration['entry'];
  devtool?: webpack.Configuration['devtool'];
  disableMinification?: boolean;
  afterBuild?: () => Promise<void>;
  plugins?: webpack.Configuration['plugins'];
}

async function webpackTask({
  entry,
  disableMinification,
  ...options
}: WebpackTaskOptions): Promise<void> {
  const willMinify = (args.minify && !disableMinification) ?? false;

  const VERSION = await getVersion();

  const bundler = webpack({
    devtool: options.devtool ?? 'source-map',
    entry,
    mode: args.production ? 'production' : 'development',
    module: {
      rules: [
        {
          resourceQuery: /raw/,
          type: 'asset/source',
        },
        {
          test: /\.m?js$/,
          include: /node_modules/,
          enforce: 'pre',
          use: ['source-map-loader'],
        },
        {
          exclude: /(node_modules|dist|packages\/core)/,
          test: /\.m?[jt]sx?$/,
          use: {
            loader: 'babel-loader',
            options: {
              plugins: [
                [
                  'transform-inline-environment-variables',
                  {
                    include: ['NODE_ENV', 'VERSION'],
                  },
                ],
              ],
            },
          },
        },
        {
          test: /\.css$/,
          use: [
            {
              loader: 'style-loader',
              options: {
                insert: (htmlElement: HTMLStyleElement) => {
                  htmlElement.setAttribute(
                    'data-calendarsdk-version',
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- this is injected by webpack
                    ///@ts-ignore
                    SDK_VERSION,
                  );
                  document.head.append(htmlElement);
                },
              },
            },
            {
              loader: 'css-loader',
              options: {
                modules: {
                  exportLocalsConvention: 'dashesOnly',
                  localIdentName: args.production
                    ? 'calendarsdk__[hash:base64]'
                    : 'calendarsdk__[name]__[local][hash:base64]',
                  mode: (resourcePath: string) =>
                    resourcePath.endsWith('.module.css') ? 'local' : 'global',
                  namedExport: true,
                },
              },
            },
            { loader: 'postcss-loader' },
          ],
        },
      ],
    },
    optimization: {
      minimize: willMinify,
    },
    output: {
      path: path.join(__dirname, 'packages/core'),
      uniqueName: 'calendarsdk_' + VERSION,
    },
    plugins: [
      new webpack.DefinePlugin({
        SDK_VERSION: JSON.stringify(VERSION),
      }),
      ...(willMinify || args.production
        ? [
            new webpack.BannerPlugin({
              banner: fs.readFileSync('./src/calendarsdk-js/header.ts', 'utf8'),
              raw: true,
              entryOnly: true,
            }),
          ]
        : []),
      ...(options.plugins ?? []),
    ],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    stats: {
      errorDetails: true,
    },
  } satisfies webpack.Configuration);

  if (args.watch) {
    bundler.watch({}, (err, stats) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log(stats?.toString({ colors: true }));

      options.afterBuild?.();
    });
  } else {
    await new Promise<void>((resolve, reject) => {
      bundler.run((err, stats) => {
        if (err) {
          console.error(err);
          reject(err);
          return;
        }
        console.log(stats?.toString({ colors: true }));
        resolve();
      });
    });
    return options.afterBuild?.();
  }
}

gulp.task('clean', async () => {
  const folders = [
    './dist',
    './packages/core/src',
    './packages/core/test',
    ...(await fg('./examples/*/dist', { onlyDirectories: true })),
  ];
  await Promise.all([
    ...folders.map((folder) =>
      fs.promises.rm(folder, { force: true, recursive: true }),
    ),
    fs.promises.rm('./packages/core/calendarsdk.min.js', { force: true }),
  ]);

  const outputFiles = [`./packages/core/${sdkFilename}.js`];

  await Promise.all(
    outputFiles.flatMap((filename) => [
      fs.promises.rm(filename, { force: true }),
      fs.promises.rm(filename + '.LICENSE.txt', { force: true }),
      fg(filename + '*.map', { onlyFiles: true }).then((mapFiles) =>
        Promise.all(
          mapFiles.map((mapFile) => fs.promises.rm(mapFile, { force: true })),
        ),
      ),
    ]),
  );
});

/**
 * Copy handwritten type definitions (calendarsdk.d.ts) and those generated from source.
 */
gulp.task('types', async () => {
  const files = await fg(['./src/**/*.d.ts'], {
    onlyFiles: true,
    ignore: ['packages/core'],
  });
  for (const f of files) {
    const newPath = path.join('./packages/core', f);
    await fs.promises.mkdir(path.dirname(newPath), { recursive: true });
    await fs.promises.copyFile(f, newPath);
  }
  await exec('yarn typedefs');
});

let startedBuildingExamples = false;

const config: WebpackTaskOptions = {
  entry: {
    [sdkFilename]: {
      // no `export: 'default'`: the bundle must expose the same namespace as the types
      // (default, CalendarSDK, load, LOADER_VERSION), see tools/check-packages.mjs
      library: {
        name: 'CalendarSDK',
        type: OutputLibraryType.UMD,
      },
      import: './src/calendarsdk-js/calendarsdk',
    },
  },
  disableMinification: true,
  afterBuild: async () => {
    if (!args.noExamples && !startedBuildingExamples) {
      startedBuildingExamples = true;

      const contentScriptFps = await fg(
        ['.ts', '.js'].map((ext) => './examples/*/content' + ext),
      );

      await buildExamples({
        contentScriptFps,
        minify: args.minify,
        watch: args.watch,
      });
    }

    if (args.reloader) {
      await extReloader();
    }
  },
};

gulp.task('sdk', () => webpackTask(config));

gulp.task('default', gulp.parallel('sdk', 'types'));
