require('dotenv').config();
const puppeteer = require('puppeteer');
const delayObject = { delay: 20 };
const tableSelector =
  'table[class=" list fixableTableHeader_jq ListDisplay sizable orderable"] > tbody';

let toSave;
try {
  toSave = require('./export.json');
  if (!Array.isArray(toSave)) {
    console.log('Converting from Logbook.com format');
    toSave = convertFromLogminionFormat(toSave);
  }
} catch (e) {
  console.log(e);
}
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
  await page.click('input[data-bcs-button-name="Apply"]');
  await page.waitFor(2000);
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
    console.log(
      'Processing project: ',
      projectData.data[0] + ' ' + projectData.data[1]
    );
    await asyncForEach(informationsToFill.hours, async (hour, dayIndex) => {
      console.log('Processing day: ', getWeekDayString(dayIndex));
      await fillDay(page, hour, dayIndex, projectRowIndex, mondayTimeStamp);
    });
  });
}

function getWeekDayString(day) {
  switch (day + 1) {
    case 1:
      return 'Mon';
    case 2:
      return 'Tue';
    case 3:
      return 'Wed';
    case 4:
      return 'Thu';
    case 5:
      return 'Fri';
    case 6:
      return 'Sat';
    case 7:
      return 'Sun';
  }
}

async function fillDay(page, hour, dayIndex, projectRowIndex, mondayTimeStamp) {
  let currentTimestamp = addDaysToDate(mondayTimeStamp, dayIndex).getTime();
  let timeSplit = hour.time.split(':');
  const comment = hour.comment;
  const hourCount = timeSplit[0];
  const minutesCount = timeSplit[1];
  if (isEmpty(comment) || isEmpty(hourCount) || isEmpty(minutesCount)) {
    console.log('nothing to process');
    return;
  }
  if (parseInt(hourCount, 10) === 0 && parseInt(minutesCount, 10) === 0) {
    console.log('no time booked for that day');
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
  await page.waitFor(500);
  await page.focus(`input[id="${hoursInputKey}"]`);
  await page.keyboard.press('Backspace');
  await page.type(`input[id="${hoursInputKey}"]`, hourCount, delayObject);
  await page.keyboard.press('Backspace');
  await page.type(`input[id="${hoursInputKey}"]`, hourCount, delayObject);
}

async function fillMinutes(page, projectRowIndex, dayIndex, minutesCount) {
  let minutesInputKey = `0_${projectRowIndex}_${5 + dayIndex}_1`;
  await page.waitFor(500);
  await page.focus(`input[id="${minutesInputKey}"]`);
  await page.keyboard.press('Backspace');
  await page.type(`input[id="${minutesInputKey}"]`, minutesCount, delayObject);
  await page.keyboard.press('Backspace');
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
  await page.keyboard.type(comment, { delay: 10 });
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

function convertFromLogminionFormat(file) {
  let toBook = [];
  Object.keys(file).forEach(dayKey => {
    let processingDayDate = new Date(parseInt(dayKey, 10));
    if (!isDateThisWeek(processingDayDate)) {
      return;
    }
    let dayInfo = file[dayKey];
    Object.keys(dayInfo).forEach(taskName => {
      if (!taskName.includes('|')) {
        return;
      }
      const taskParts = taskName.split('|');
      let botProject = taskParts[0].trim();
      let botTask = taskParts[1].trim();

      toBook = addTaskIfNotInArray(toBook, botProject, botTask);
      const logs = dayInfo[taskName];
      const dayNumber = processingDayDate.getDay();
      toBook = addLogsToBook(toBook, botProject, botTask, dayNumber, logs);
    });
  });

  return toBook;
}

function isDateThisWeek(date) {
  //SUNDAY is 0
  const MS_IN_DAY = 86400 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - date.getTime();
  const daysDiff = diff / MS_IN_DAY;
  const maxDiff = today.getDay() - 1;
  if (daysDiff <= maxDiff && daysDiff >= 0) {
    return true;
  } else {
    return false;
  }
}

function addTaskIfNotInArray(toBook, projectName, taskName) {
  let found = false;
  toBook.forEach(task => {
    if (found) {
      return;
    }
    found = task.project === projectName && task.task === taskName;
  });
  if (!found) {
    toBook.push({
      project: projectName,
      task: taskName,
      hours: [
        { comment: '', time: '0:00' },
        { comment: '', time: '0:00' },
        { comment: '', time: '0:00' },
        { comment: '', time: '0:00' },
        { comment: '', time: '0:00' }
      ]
    });
  }
  return toBook;
}

function addLogsToBook(toBook, projectName, taskName, day, logs) {
  const arrayIndexDay = day - 1;
  if (arrayIndexDay > 4 || arrayIndexDay < 0) {
    console.log('task is not during week');
    return;
  }

  toBook.forEach(task => {
    if (task.project === projectName && task.task === taskName) {
      let totalDuration = getLogsTotalDuration(logs);
      let stringDuration =
        String((totalDuration - (totalDuration % 60)) / 60) +
        ':' +
        String(totalDuration % 60);
      let summary = getSummaryDescription(logs);
      task.hours[arrayIndexDay].comment = summary;
      task.hours[arrayIndexDay].time = stringDuration;
    }
  });
  return toBook;
}

function getLogsTotalDuration(logs) {
  let totalDurationInMinutes = 0;
  logs.forEach(log => {
    totalDurationInMinutes += Math.floor(log.duration / 60);
  });

  return totalDurationInMinutes;
}

function getSummaryDescription(logs) {
  let summary = '';
  logs.forEach(log => {
    summary += log.description + ', ';
  });
  return summary;
}

run();
