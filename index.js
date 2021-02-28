const lighthouse = require("lighthouse");
const chromeLauncher = require("chrome-launcher");
const argv = require("yargs").argv;
const fs = require("fs");
const sites = require("./urls.json");

const metricFilter = [
  "first-contentful-paint",
  "first-meaningful-paint",
  "speed-index",
  "estimated-input-latency",
  "total-blocking-time",
  "max-potential-fid",
  "time-to-first-byte",
  "first-cpu-idle",
  "interactive",
  "critical-request-chains",
  "bootup-time",
];

const launchChromeAndRunLighthouse = (url) => {
  return chromeLauncher.launch().then((chrome) => {
    const opts = {
      port: chrome.port,
    };
    return lighthouse(url, opts).then((results) => {
      return chrome.kill().then(() => ({
        js: results.lhr,
        json: results.report,
      }));
    });
  });
};

const prepareFolder = (inputURL) => {
  let dirName = inputURL.host.replace("www.", "");
  if (inputURL.pathname !== "/") {
    dirName = dirName + inputURL.pathname.replace(/\//g, "_");
  }
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName);
  }
  return dirName;
};

const writeReport = (results, inputDir) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(
      `${inputDir}/report-${results.js["fetchTime"].replace(/:/g, "_")}.json`,
      results.json,
      (err) => {
        if (err) reject(err);
        resolve();
      }
    );
  });
};

const moveOldReport = async (inputDir) => {
  let foundResults = await fs.promises.readdir(`./${inputDir}`);
  if (!fs.existsSync(`${inputDir}/old-reports/`)) {
    fs.mkdirSync(`${inputDir}/old-reports/`);
  }
  foundResults.forEach(async (element) => {
    if (element.indexOf("report-") >= 0) {
      const oldPath = `${inputDir}/${element}`;
      const newPath = `${inputDir}/old-reports/${element}`;
      await fs.promises.rename(oldPath, newPath);
    }
  });
};

const compareReports = async (inputReport, inputDir) => {
  let directoryFiles = await fs.promises.readdir(`./${inputDir}`);
  let reducedFiles = directoryFiles.filter(
    (file) => file.indexOf("report-") >= 0
  );

  if (reducedFiles.length !== 0) {
    const oldReport = JSON.parse(
      fs.readFileSync(`${inputDir}/${reducedFiles}`, "utf8")
    );

    let outputString = "";

    for (let auditObj in oldReport["audits"]) {
      if (metricFilter.includes(auditObj)) {
        let oldValue = oldReport["audits"][auditObj].numericValue;
        let newValue = inputReport["audits"][auditObj].numericValue;
        const differenceInAudit = difference(oldValue, newValue);

        outputString += auditObj;
        outputString += `\n    Old value is ${
          Math.round(oldValue * 100) / 100
        }`;
        outputString += `\n    New value is ${
          Math.round(newValue * 100) / 100
        }`;
        outputString += `\n    difference is ${differenceInAudit}%\n\n`;
      }
    }
    console.log(outputString);
    fs.writeFileSync(`${inputDir}/differences.txt`, outputString);
  }
};

const difference = (from, to) => {
  const per = ((to - from) / from) * 100;
  return Math.round(per * 100) / 100;
};

const main = async () => {
  if (argv.url) {
    const urlObj = new URL(argv.url);
    let dirName = prepareFolder(urlObj);
    console.log("Overriding with cli argument");

    let lighthouseReport = await launchChromeAndRunLighthouse(argv.url);
    await moveOldReport(dirName);
    await writeReport(lighthouseReport, dirName);
  } else {
    sites.forEach(async (site) => {
      const urlObj = new URL(site);
      let dirName = prepareFolder(urlObj);
      let lighthouseReport = await launchChromeAndRunLighthouse(urlObj.href);

      compareReports(lighthouseReport.js, dirName);

      try {
        await moveOldReport(dirName);
      } catch (toperr) {
        console.log(toperr);
      }

      await writeReport(lighthouseReport, dirName);
    });
  }
};

main();
