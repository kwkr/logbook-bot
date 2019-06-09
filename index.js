require('dotenv').config();
const puppeteer = require('puppeteer');
const delayObject = { delay: 10 };
const tableSelector =
  'table[class=" list fixableTableHeader_jq ListDisplay sizable orderable"] > tbody';

let toSave;
try {
  toSave = require('./toFill.json');
} catch (e) {}
if (!toSave || toSave.length === 0) {
  console.log('No data to book. Exiting...');
  process.exit();
}

async function run() {
  const browser = await puppeteer.launch({
    headless: false
  });

  const page = (await browser.pages())[0];

  await page.goto(process.env.PROJEKTRON_LINK);

  await performLogin(page);
  await dismissNotificationDialog(page);
  await goToWeeklyLogs(page);
  let rowsHandles = await getLogRowsHandles(page);
  let rowInfo = await getRequiredTaskRowsInfo(rowsHandles, page);
  await fillWeek(page, rowInfo);
  await page.waitFor(100);
  await page.waitForSelector('input[data-bcs-button-name="Apply"]');
  //uncomment to save
  //await page.click('input[data-bcs-button-name="Apply"]');
  await browser.close();
}

async function performLogin(page) {
  await page.waitForSelector('input[id=label_user]');
  await page.type('input[id=label_user]', process.env.PROJEKTRON_USER, {
    delay: 10
  });
  await page.type('input[id=label_pwd]', process.env.PROJEKTRON_PWD, {
    delay: 10
  });
  await page.click('input[type=submit]');
}

async function dismissNotificationDialog(page) {
  await page.waitForSelector(
    'input[class="button notificationPermissionLater"]'
  );
  await page.click('input[class="button notificationPermissionLater"]');
}

async function goToWeeklyLogs(page) {
  await page.click('a[id="PageTab_Link_jq_multidaytimerecording"]');
}

async function getLogRowsHandles(page) {
  await page.waitForSelector(
    'td[class="listheader blueMarkRow ui-draggable-handle"]'
  );
  const rowSelector = tableSelector + ' > tr td:nth-child(1) .hover.toBlur';
  return await page.$$(rowSelector);
}

function getWeekStartTimeStamp() {
  let ts = getCurrentMondayDate(new Date());
  ts.setHours(0, 0, 0, 0);
  ts = ts.getTime();
  return ts;
}

const getInformationToFillForProject = function(projectData) {
  const [project, task] = projectData;
  for (let k = 0; k < toSave.length; k++) {
    const toBook = toSave[k];
    if (
      toBook.project.trim() === project.trim() &&
      toBook.task.trim() === task.trim()
    ) {
      return toBook;
    }
  }
  return undefined;
};

const isProjectInFillScope = function(project, task) {
  let isInScope = false;
  toSave.forEach(toBook => {
    if (
      toBook.project.trim() === project.trim() &&
      toBook.task.trim() === task.trim()
    ) {
      isInScope = true;
      return true;
    }
  });
  return isInScope;
};

function getCurrentMondayDate(d) {
  d = new Date(d);
  let day = d.getDay(),
    diff = d.getDate() - day + (day == 0 ? -6 : 1); // adjust when day is sunday
  return new Date(d.setDate(diff));
}

function addDaysToDate(date, days) {
  let result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isEmpty(toTest) {
  return !toTest || toTest === '';
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

async function getRequiredTaskRowsInfo(elements, page) {
  let data = [];
  let cell = [];
  let indexesToReturn = [];

  await asyncForEach(elements, async (el, idx) => {
    const text = await page.evaluate(element => element.textContent, el);
    cell.push(text);
    if (idx % 2 != 0) {
      data.push(cell);
      if (isProjectInFillScope(cell[0], cell[1])) {
        indexesToReturn.push({ index: Math.floor(idx / 2), data: cell });
      }
      cell = [];
    }
  });
  return indexesToReturn;
}

async function fillWeek(page, projectRowData) {
  let mondayTimeStamp = getWeekStartTimeStamp();
  await asyncForEach(projectRowData, async projectData => {
    let informationsToFill = getInformationToFillForProject(projectData.data);
    let projectRowIndex = projectData.index;
    await asyncForEach(informationsToFill.hours, async (hour, dayIndex) => {
      await fillDay(page, hour, dayIndex, projectRowIndex, mondayTimeStamp);
    });
  });
}

async function fillDay(page, hour, dayIndex, projectRowIndex, mondayTimeStamp) {
  let currentTimestamp = addDaysToDate(mondayTimeStamp, dayIndex).getTime();
  let timeSplit = hour.time.split(':');
  const comment = hour.comment;
  const hourCount = timeSplit[0];
  const minutesCount = timeSplit[1];
  if (isEmpty(comment) || isEmpty(hourCount) || isEmpty(minutesCount)) {
    return;
  }
  await page.waitFor(1000);
  await fillHours(page, projectRowIndex, dayIndex, hourCount);
  await fillMinutes(page, projectRowIndex, dayIndex, minutesCount);
  await openComment(page, projectRowIndex, currentTimestamp);
  await fillComment(page, comment);
  await closeCommentDialog(page);
}

async function fillHours(page, projectRowIndex, dayIndex, hourCount) {
  let hoursInputKey = `0_${projectRowIndex}_${5 + dayIndex}_0`;
  await page.type(`input[id="${hoursInputKey}"]`, hourCount, delayObject);
}

async function fillMinutes(page, projectRowIndex, dayIndex, minutesCount) {
  let minutesInputKey = `0_${projectRowIndex}_${5 + dayIndex}_1`;
  await page.type(`input[id="${minutesInputKey}"]`, minutesCount, delayObject);
}

async function openComment(page, projectRowIndex, currentTimestamp) {
  await page.click(
    `${tableSelector} > tr:nth-child(${projectRowIndex +
      1}) > td[data-date~="${currentTimestamp}"] button`,
    delayObject
  );
}

async function fillComment(page, comment) {
  await page.waitFor(50);
  const textAreaSelector = `.textAttributeShort textarea`;
  await page.waitForSelector(textAreaSelector);
  await page.waitFor(100);
  await page.$eval(textAreaSelector, el => el.focus());
  await page.keyboard.type(comment, { delay: 100 });
}

async function closeCommentDialog(page) {
  await page.waitFor(500);
  await page.keyboard.press('Tab', {
    delay: 100
  });
  await page.waitFor(1000);
  await page.keyboard.press('Enter', {
    delay: 100
  });
  await page.waitFor(500);
}

run();
