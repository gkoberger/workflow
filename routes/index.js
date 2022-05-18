const express = require("express");
const util = require("util");
const router = express.Router();
const fs = require("fs");
const exec = util.promisify(require("child_process").exec);
const gitlog = require("gitlog").default;
const arrayDiff = require("arraydiff");
const _ = require("lodash");
const jot = require("jot");

const file = (n) => `../test.git/${n || "test"}.md`;

/* GET home page. */
router.get("/", async (req, res, next) => {
  const page = getPage("main");

  const branches = await getBranches();

  const branch = (await git("symbolic-ref --short HEAD")).trim();

  const diff = await git(`diff main ${branch} -- test.md`);
  const diffSidebar = await git(`diff main ${branch} -- sidebar.md`);

  const options = {
    repo: "../test.git/",
    number: 20,
    fields: ["hash", "abbrevHash", "subject", "authorName", "authorDateRel"],
    //execOptions: { maxBuffer: 1000 * 1024 },
  };

  const sidebar = getSidebar();

  const commits = gitlog(options);

  res.render("index", {
    title: "Home",
    page,
    branches,
    diff,
    diffSidebar,
    branch,
    commits,
    sidebar,
  });
});

async function git(command) {
  const opt = { cwd: "../test.git" };
  const { stdout, stderr } = await exec(`git ${command}`, opt);
  return stdout;
}

router.post("/save", async (req, res, next) => {
  fs.writeFileSync(file(), req.body.markdown);

  await git("add test.md");
  await git('commit -m"Update test.md" --author="Greg Test <greg@readme.io>"');
  res.redirect("/");
});

router.post("/sidebar", async (req, res, next) => {
  fs.writeFileSync(file("sidebar"), req.body.sidebar);

  await git("add sidebar.md");
  await git('commit -m"Update sidebar" --author="Greg Test <greg@readme.io>"');
  res.redirect("/");
});

router.get("/create/:branch", async (req, res, next) => {
  console.log(`checkout -b ${req.params.branch}`);
  await git(`checkout -b ${req.params.branch}`);
  res.redirect("/");
});

router.get("/switch/:branch", async (req, res, next) => {
  await git(`checkout ${req.params.branch}`);
  res.redirect("/");
});

router.get("/diff/:branch", async (req, res, next) => {
  console.log(diff);
  res.send(diff);
});

router.get("/merge/:branch", async (req, res, next) => {
  await git(`checkout main`);
  try {
    await git(`merge ${req.params.branch}`);
  } catch (e) {
    if (e.stdout.match(/sidebar/)) {
      /*
      await git(`merge --abort`);
      return res.send(e.stdout);
      */

      await fixConflict(req.params.branch);
    }
  }
  await git(`branch -D ${req.params.branch}`);
  res.redirect("/");
});

router.get("/reset", async (req, res, next) => {
  await git(`checkout main`);

  let branches = await getBranches();
  branches.forEach(async (b) => {
    if (b !== "main") {
      await git(`branch -D ${b}`);
    }
  });

  const sidebar = `Category
 * [Test Page 1](/test)
 * [Test Page 2](/test)
 * [Test Page 3](/test)
 * [Test Page 4](/test)`;

  fs.writeFileSync(file("sidebar"), sidebar);

  try {
    await git("add sidebar.md");
    await git('commit -m "Fix sidebar"');
  } catch (e) {
    console.log(e);
  }

  await git("update-ref -d refs/heads/main");
  await git('commit -m "Initial commit"');

  res.redirect("/");
});

function getPage(branch) {
  const data = fs.readFileSync(file(), "utf8");
  return data;
}

function getSidebar(data) {
  // this is bad and i feel bad but also don't care
  if (!data) {
    data = fs.readFileSync(file("sidebar"), "utf8");
  }
  return data.match(/\*\s\[(.*)\]/g).map((d) => d.match(/\[(.*)\]/)[1]);
}

async function getBranches() {
  let branches = await git("branch");
  branches = branches
    .trim()
    .split("\n")
    .map((b) => b.replace(/\*\s+/, "").trim());

  const first = "main";
  branches = branches.sort(function (x, y) {
    return x == first ? -1 : y == first ? 1 : 0;
  });

  return branches;
}

async function getOperations(hash) {
  try {
    const b = await git(`show '${hash}^1':sidebar.md`);
    const a = await git(`show '${hash}':sidebar.md`);
    return {
      operations: arrayDiff(getSidebar(b), getSidebar(a)),
      sidebar: getSidebar(b),
    };
  } catch (e) {}
  const b = await git(`show '${hash}':sidebar.md`);
  return { operations: [], sidebar: getSidebar(b) };
}

function prepareSidebar(items) {
  items = items.map((i) => `  * [${i}](/test)`);
  return `Category\n${items.join("\n")}`;
}

async function fixConflict(branch) {
  /* Hello there! I'm going to walk you through this horrible function I wrote in about an hour.
   * It's bad and doesn't actually work perfectly (for a few reasons I'll enumerate), but
   * with a bit of love it could!
   */

  const options = {
    repo: "../test.git/",
    number: 20,
    fields: ["hash", "abbrevHash", "subject", "authorName", "authorDateRel"],
  };

  const commits = gitlog(options);

  options.branch = `main..${branch}`;

  const newCommits = gitlog(options);

  // This gets us a list of "actions" we can send to JOT, by going through
  // commits. I'm not sure this is the best way to do this, but it works!
  let baseUpdates = await prepareJOT(commits);
  let newUpdates = await prepareJOT(newCommits);

  // This just gets us the original base file to start with
  const origHash = commits[commits.length - 1].hash;
  const origFile = await git(`show '${origHash}':sidebar.md`);
  const orig = getSidebar(origFile);

  // This is JOT's version of merge
  const out = newUpdates.compose(baseUpdates).apply(orig);

  // We DONT actually want to do this; this just deletes all
  // changes in the branch.
  //
  // We need to redo this part to use the new sidebar we have
  // to fix the merge conflict, NOT to overwrite everything.

  await git(`merge --abort`);

  fs.writeFileSync(file("sidebar"), prepareSidebar(out));

  // Like I said above, this should
  await git("add sidebar.md");
  await git(
    'commit -m"Fix sidebar conflict" --author="Greg Test <greg@readme.io>"'
  );

  /*
   * TODO! We actually need something like this:
  fs.writeFileSync(file("sidebar"), prepareSidebar(out));

  await git("add sidebar.md");
  await git('commit -m"Fix sidebar conflict" --author="Greg Test <greg@readme.io>"');

  await git(`checkout main`);
  await git(`merge ${branch}`);
  */
}

async function prepareJOT(commits) {
  // Okay, this isn't necessarily the best way to do this, but
  // I wanted to use JOT since we already were.
  //
  // It basically just diffs every single version of the sidebar,
  // and replays it back using JOT. I do it in a very inefficient way here,
  // but a bit of optimizations would go a long way.

  const tasks = [];
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const { operations, sidebar } = await getOperations(c.hash);

    operations.forEach(function (o) {
      if (o.type === "insert") {
        tasks.push(new jot.SPLICE(o.index, 0, o.values));
      }
      if (o.type === "move") {
        // This is NOT correct. It works for one reorder.
        // It's because JOT has no move functionality, so
        // there's no way to get the updated value using it.
        //
        // We'd likely have to fork JOT for this? Or maybe
        // Ilias figured it out!

        tasks.push(new jot.SPLICE(o.from, 1, []));
        tasks.push(new jot.SPLICE(o.to, 0, [sidebar[o.from]]));
      }
    });
  }

  return new jot.LIST(tasks);
}

module.exports = router;
