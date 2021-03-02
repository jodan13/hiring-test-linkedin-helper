import { IExecutor } from "./Executor";
import ITask from "./Task";

export default async function run(
  executor: IExecutor,
  queue: Iterable<ITask>,
  maxThreads = 0
) {
  maxThreads = Math.max(0, maxThreads);

  /**
   * Код надо писать сюда
   * Тут что-то вызываем в правильном порядке executor.executeTask для тасков из очереди queue
   */
  const runningPromises = new Map();
  const queuePromises = new Map();

  async function taskCompletion(iteratorNext: ITask) {
    const executeTask = executor.executeTask(iteratorNext);
    runningPromises.set(iteratorNext.targetId, executeTask);
    await executeTask;
    runningPromises.delete(iteratorNext.targetId);
  }

  async function parallel(iteratorNext: ITask) {
    taskCompletion(iteratorNext);
    if (queuePromises.has(iteratorNext.targetId) && !runningPromises.has(iteratorNext.targetId)) {
      series(queuePromises.get(iteratorNext.targetId));
    }
  }

  async function series(queueForThisId: any) {
    const iteratorNext = queueForThisId.values().next().value;
    if(iteratorNext && !runningPromises.get(iteratorNext.targetId)) {
      taskCompletion(iteratorNext);
      queuePromises.get(iteratorNext.targetId).delete(iteratorNext);
    }
  }
  while (true) {
    for (const iteratorNext of queue) {
      if (runningPromises.has(iteratorNext.targetId)) {
        if (queuePromises.has(iteratorNext.targetId)) {
          queuePromises.get(iteratorNext.targetId).add(iteratorNext);
        } else {
          const turnPromises = new Set();
          turnPromises.add(iteratorNext);
          queuePromises.set(iteratorNext.targetId, turnPromises);
        }
        series(queuePromises.get(iteratorNext.targetId));
      } else {
        if (maxThreads !== 0) {
          while(runningPromises.size >= maxThreads) {
            await Promise.race(runningPromises.values());
          }
        }
        if (queuePromises.has(iteratorNext.targetId) && queuePromises.get(iteratorNext.targetId).size !== 0) {
          queuePromises.get(iteratorNext.targetId).add(iteratorNext);
          series(queuePromises.get(iteratorNext.targetId));
        } else {
          parallel(iteratorNext);
        }
      }
      if(queuePromises.size) {
        for (const queueForThisId of queuePromises.values()) {
          for (const iteratorNext of queueForThisId) {
            if (runningPromises.has(iteratorNext.targetId)) {
              series(queuePromises.get(iteratorNext.targetId));
            } else {
              if (maxThreads !== 0) {
                while(runningPromises.size >= maxThreads) {
                  await Promise.race(runningPromises.values());
                }
              }
              if (queuePromises.has(iteratorNext.targetId) && queuePromises.get(iteratorNext.targetId).size !== 0) {
                queuePromises.get(iteratorNext.targetId).add(iteratorNext);
                series(queuePromises.get(iteratorNext.targetId));
              } else {
                parallel(iteratorNext);
              }
            }
          }
        }
      }
      queuePromises.forEach((value, key, map) => value.size === 0 && map.delete(key));
    }
    while (queuePromises.size) {
      await Promise.race(runningPromises.values());
      for (const queueForThisId of queuePromises.values()) {
        for (const iteratorNext of queueForThisId) {
          if (runningPromises.has(iteratorNext.targetId)) {
            series(queuePromises.get(iteratorNext.targetId));
          } else {
            if (maxThreads !== 0) {
              while(runningPromises.size >= maxThreads) {
                await Promise.race(runningPromises.values());
              }
            }
            if (queuePromises.has(iteratorNext.targetId) && queuePromises.get(iteratorNext.targetId).size !== 0) {
              queuePromises.get(iteratorNext.targetId).add(iteratorNext);
              series(queuePromises.get(iteratorNext.targetId));
            } else {
              parallel(iteratorNext);
            }
          }
        }
      }
      queuePromises.forEach((value, key, map) => value.size === 0 && map.delete(key));
    }
    await Promise.all(runningPromises.values());
    const iterator: Iterator<ITask, any, undefined> = queue[Symbol.iterator]();
    const iteratorDone = iterator.next();
    const iteratorNext = iteratorDone.value;
    if (iteratorNext) {
      parallel(iteratorNext);
    }
    if (iteratorDone.done) {
      break;
    }
  }
  return new Promise<void>(resolve => {
    resolve();
  });
}
