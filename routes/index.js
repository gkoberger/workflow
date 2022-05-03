const express = require('express');
const util = require('util');
const router = express.Router();
const fs = require('fs');
const exec = util.promisify(require('child_process').exec);
const gitlog = require("gitlog").default;

const file = '../test.git/test.md';

/* GET home page. */
router.get('/', async (req, res, next) => {
  const page = getPage('main');

  const branches = await getBranches();

  const branch = (await git('symbolic-ref --short HEAD')).trim();
  console.log("BRANCH", branch);

  const diff = await git(`diff ${branch} main -- test.md`);

  const options = {
    repo: "../test.git/",
    number: 20,
    fields: ["hash", "abbrevHash", "subject", "authorName", "authorDateRel"],
    //execOptions: { maxBuffer: 1000 * 1024 },
  };

  const commits = gitlog(options);

  res.render('index', { title: 'Home', page, branches, diff, branch, commits });
});

async function git(command) {
  const opt = { cwd: '../test.git' };
  const {stdout, stderr} = await exec(`git ${command}`, opt);
  return stdout;
}

router.post('/save', async (req, res, next) => {
  fs.writeFileSync(file, req.body.markdown);

  await git('add test.md');
  await git('commit -m"Update" --author="Greg Test <greg@readme.io>"');
  res.redirect('/');
});

router.get('/create/:branch', async (req, res, next) => {
  console.log(`checkout -b ${req.params.branch}`);
  await git(`checkout -b ${req.params.branch}`);
  res.redirect('/');
});

router.get('/switch/:branch', async (req, res, next) => {
  await git(`checkout ${req.params.branch}`);
  res.redirect('/');
});

router.get('/diff/:branch', async (req, res, next) => {
  console.log(diff);
  res.send(diff);
});

router.get('/reset', async (req, res, next) => {
  let branches = await getBranches();
  branches.forEach(async b => {
    if (b !== 'main') {
      await git(`branch -D ${b}`);
    }
  });

  res.redirect('/');
});

function getPage(branch) {
  const data = fs.readFileSync(file, 'utf8');
  return data;
}

async function getBranches() {
  let branches = await git('branch');
  branches = branches.trim().split('\n').map(b => b.replace(/\*\s+/, '').trim());

  const first = 'main';
  branches = branches.sort(function(x,y){ return x == first ? -1 : y == first ? 1 : 0; });

  return branches;
}

module.exports = router;
