const taskDepartments = ['Marketing','Expert acquisition','Content','Social media','Development','Design','Operations'];
const taskTypes = ['Daily recurring','Operational','Project-based','Strategic','Unplanned','Research'];
const taskPointBands = [[15,1],[30,2],[60,3],[180,5],[300,8],[Infinity,13]];
const taskPoints = task => {
  const minutes = Number(task.hours) * 60;
  return Number.isFinite(minutes) && minutes > 0 ? taskPointBands.find(([limit]) => minutes <= limit)[1] : 0;
};

function taskPeriod(date, period) {
  if (period === 'Daily') return [date,date];
  const start = new Date(date+'T12:00:00Z');
  const end = new Date(start);
  if (period === 'Weekly') {
    start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate()+6);
  } else {
    start.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth()+1,0);
  }
  return [start,end].map(value=>value.toISOString().slice(0,10));
}

function taskSummary(tasks, start, end, dateForTime) {
  const within = value => Boolean(value && value >= start && value <= end);
  const planned = tasks.filter(task=>task.taskType!=='Unplanned' && within(task.plannedDate||task.due));
  const finished = tasks.filter(task=>task.status==='Done' && task.completedAt && within(dateForTime(task.completedAt)));
  const finishedSet = new Set(finished);
  const unplanned = finished.filter(task=>task.taskType==='Unplanned');
  const points = rows=>rows.reduce((sum,task)=>sum+taskPoints(task),0);
  const plannedPoints = points(planned);
  const completedPlannedPoints = points(planned.filter(task=>finishedSet.has(task)));
  return {planned,finished,unplanned,plannedPoints,completedPlannedPoints,
    pending:planned.filter(task=>task.status!=='Done'), completedPoints:points(finished),
    hours:finished.reduce((sum,task)=>sum+(task.actualHours===''||task.actualHours==null
      ? (Number(task.elapsed)||0)/3600000 : Number(task.actualHours)||0),0),
    score:plannedPoints?Math.round(100*completedPlannedPoints/plannedPoints):null};
}
