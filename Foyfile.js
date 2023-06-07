const { task, logger, fs, setGlobalOptions } = require('foy')
const path = require('path');
var nbgv = require('nerdbank-gitversioning')

setGlobalOptions({ loading: false }) 

task('setversion', async ctx => {
  const compilerPath = path.join(__dirname, "packages", "compiler")
  const fxPath = path.join(__dirname, "packages", "framework")

  await nbgv.setPackageVersion(__dirname);
  await nbgv.setPackageVersion(compilerPath);
  await nbgv.setPackageVersion(fxPath);
})

task('build', async ctx => {

  const version = await nbgv.getVersion();
  logger.warn(`Version: ${version.version} (${version.commit})`);
  // 
  await ctx.exec('tsc --build tsconfig.json');
})

task('clean', async ctx => {
  await ctx.exec('tsc --build tsconfig.json --clean');
  await ctx.exec('git clean -dxf', { cwd: './samples' });
})

const samples = [
  "helloworld", 
  "nep11token", 
  "nep17token", 
  // "registrar"
];

async function buildSample(ctx, sample) {
  const cwd = path.join(__dirname, "samples", sample);
  const compilerPath = path.posix.join(__dirname, "packages/compiler/lib/main.js").replace(/\\/g, '/');
  await ctx.exec(`node ${compilerPath} ${sample}.ts -o ./out`, { cwd });

  const batchPath = path.posix.join(cwd, "express.batch");
  if (fs.existsSync(batchPath)) {
    await ctx.exec(`dotnet neoxp batch -r express.batch`, { cwd });
  }
}

samples.forEach(sample => {
  task(sample, ['build'], async ctx => {
    await buildSample(ctx, sample);
  })
})

task('samples', ['build'], async ctx => {
  for (const sample of samples) {
    await buildSample(ctx, sample);
  }
})