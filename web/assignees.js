function assignees(record) {
  const names = Array.isArray(record?.owners) ? record.owners : [record?.owner];
  return [...new Set(names.filter(name=>typeof name==='string').map(name=>name.trim()).filter(Boolean))];
}

const assignedTo = (record,name) => Boolean(name && assignees(record).includes(name));
const assigneeLabel = record => assignees(record).join(', ');

function setAssignees(record,names) {
  record.owners = assignees({owners:names});
  record.owner = record.owners[0] || '';
}
