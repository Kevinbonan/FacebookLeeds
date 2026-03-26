const activeLocks = new Set();

function acquireLock(key) {
  if (!key) {
    return false;
  }

  if (activeLocks.has(key)) {
    return false;
  }

  activeLocks.add(key);
  return true;
}

function releaseLock(key) {
  if (!key) {
    return;
  }

  activeLocks.delete(key);
}

module.exports = {
  acquireLock,
  releaseLock
};
