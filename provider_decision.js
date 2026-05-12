"use strict";

class PriorityQueue {
  constructor() {
    this.queue = [];
  }

  enqueue(node, cost) {
    this.queue.push({ node, cost });
    this.queue.sort((a, b) => a.cost - b.cost);
  }

  dequeue() {
    return this.queue.shift();
  }

  isEmpty() {
    return this.queue.length === 0;
  }
}

function buildGraphForStorage(
  awsHot,
  azureHot,
  awsCool,
  azureCool,
  awsArchive,
  azureArchive,
  transferCosts,
  options
) {
  let graph = {
    AWS_Hot: {
      costs: awsHot.totalMonthlyCost,
      edges: {
        AWS_Cool: transferCosts.AWS_Hot_to_AWS_Cool,
        Azure_Cool: transferCosts.AWS_Hot_to_Azure_Cool,
      },
    },
    Azure_Hot: {
      costs: azureHot.totalMonthlyCost,
      edges: {
        AWS_Cool: transferCosts.Azure_Hot_to_AWS_Cool,
        Azure_Cool: transferCosts.Azure_Hot_to_Azure_Cool,
      },
    },
    AWS_Cool: {
      costs: awsCool.totalMonthlyCost,
      edges: {
        AWS_Archive: transferCosts.AWS_Cool_to_AWS_Archive,
        Azure_Archive: transferCosts.AWS_Cool_to_Azure_Archive,
      },
    },
    Azure_Cool: {
      costs: azureCool.totalMonthlyCost,
      edges: {
        AWS_Archive: transferCosts.Azure_Cool_to_AWS_Archive,
        Azure_Archive: transferCosts.Azure_Cool_to_Azure_Archive,
      },
    },
    AWS_Archive: {
      costs: awsArchive.totalMonthlyCost,
      edges: {},
    },
    Azure_Archive: {
      costs: azureArchive.totalMonthlyCost,
      edges: {},
    },
  };

  // OnPrem extension: add OnPrem_Hot, OnPrem_Cool, OnPrem_Archive nodes with cost=0
  // (real on-prem storage cost is added separately via calculateOnPremLayerCost
  // in calculateCosts; zero in the graph avoids double-counting). Cross-domain
  // edges carry real transfer costs from data_transfer.js.
  if (options && options.onpremEnabled) {
    graph.OnPrem_Hot = {
      costs: 0,
      edges: {
        AWS_Cool: transferCosts.OnPrem_Hot_to_AWS_Cool || 0,
        Azure_Cool: transferCosts.OnPrem_Hot_to_Azure_Cool || 0,
        OnPrem_Cool: transferCosts.OnPrem_Hot_to_OnPrem_Cool || 0,
      },
    };
    graph.OnPrem_Cool = {
      costs: 0,
      edges: {
        AWS_Archive: transferCosts.OnPrem_Cool_to_AWS_Archive || 0,
        Azure_Archive: transferCosts.OnPrem_Cool_to_Azure_Archive || 0,
        OnPrem_Archive: transferCosts.OnPrem_Cool_to_OnPrem_Archive || 0,
      },
    };
    graph.OnPrem_Archive = { costs: 0, edges: {} };

    graph.AWS_Hot.edges.OnPrem_Cool = transferCosts.AWS_Hot_to_OnPrem_Cool || 0;
    graph.Azure_Hot.edges.OnPrem_Cool = transferCosts.Azure_Hot_to_OnPrem_Cool || 0;
    graph.AWS_Cool.edges.OnPrem_Archive = transferCosts.AWS_Cool_to_OnPrem_Archive || 0;
    graph.Azure_Cool.edges.OnPrem_Archive = transferCosts.Azure_Cool_to_OnPrem_Archive || 0;
  }

  return graph;
}

function findCheapestStoragePath(graph, startNodes, endNodes) {
  let costs = {};
  let parents = {};
  let pq = new PriorityQueue();

  for (let node in graph) {
    costs[node] = Infinity;
  }

  for (let startNode of startNodes) {
    costs[startNode] = graph[startNode].costs;
    pq.enqueue(startNode, costs[startNode]);
  }

  while (!pq.isEmpty()) {
    let { node, cost } = pq.dequeue();

    if (cost > costs[node]) continue;
    if (!graph[node] || !graph[node].edges) continue;

    for (let neighbor in graph[node].edges) {
      let edgeCost = graph[node].edges[neighbor] || 0;
      let newCost = cost + edgeCost + graph[neighbor].costs;

      if (newCost < costs[neighbor]) {
        costs[neighbor] = newCost;
        parents[neighbor] = node;
        pq.enqueue(neighbor, newCost);
      }
    }
  }

  let target = endNodes.reduce(
    (cheapest, node) => (costs[node] < costs[cheapest] ? node : cheapest),
    endNodes[0]
  );

  let cheapestPath = [];
  let currentNode = target;
  while (currentNode) {
    cheapestPath.unshift(currentNode);
    currentNode = parents[currentNode];
  }

  return {
    path: cheapestPath,
    cost: costs[target],
  };
}
