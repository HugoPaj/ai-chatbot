'use client';

interface PerformanceMetrics {
  requestStart: number;
  firstTokenTime?: number;
  streamComplete?: number;
  totalTime?: number;
  tokenCount?: number;
  tokensPerSecond?: number;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetrics> = new Map();

  startRequest(requestId: string): void {
    this.metrics.set(requestId, {
      requestStart: performance.now(),
    });
  }

  recordFirstToken(requestId: string): void {
    const metric = this.metrics.get(requestId);
    if (metric) {
      metric.firstTokenTime = performance.now() - metric.requestStart;
    }
  }

  recordStreamComplete(requestId: string, tokenCount?: number): void {
    const metric = this.metrics.get(requestId);
    if (metric) {
      const now = performance.now();
      metric.streamComplete = now - metric.requestStart;
      metric.totalTime = metric.streamComplete;

      if (tokenCount && metric.firstTokenTime) {
        const streamTime = metric.streamComplete - metric.firstTokenTime;
        metric.tokenCount = tokenCount;
        metric.tokensPerSecond = tokenCount / (streamTime / 1000);
      }
    }
  }

  getMetrics(requestId: string): PerformanceMetrics | undefined {
    return this.metrics.get(requestId);
  }

  logMetrics(requestId: string): void {
    const metrics = this.metrics.get(requestId);
    if (metrics) {
      console.group(`🚀 Performance Metrics - ${requestId.slice(0, 8)}...`);

      if (metrics.firstTokenTime) {
        console.log(`⚡ Time to First Token: ${metrics.firstTokenTime.toFixed(0)}ms`);
      }

      if (metrics.totalTime) {
        console.log(`🏁 Total Response Time: ${metrics.totalTime.toFixed(0)}ms`);
      }

      if (metrics.tokensPerSecond) {
        console.log(`🔥 Streaming Speed: ${metrics.tokensPerSecond.toFixed(1)} tokens/sec`);
      }

      if (metrics.tokenCount) {
        console.log(`📊 Total Tokens: ${metrics.tokenCount}`);
      }

      console.groupEnd();
    }
  }

  getAverageMetrics(): {
    avgFirstToken: number;
    avgTotalTime: number;
    avgTokensPerSecond: number;
  } {
    const allMetrics = Array.from(this.metrics.values());

    const firstTokenTimes = allMetrics
      .map(m => m.firstTokenTime)
      .filter((t): t is number => t !== undefined);

    const totalTimes = allMetrics
      .map(m => m.totalTime)
      .filter((t): t is number => t !== undefined);

    const tokensPerSecond = allMetrics
      .map(m => m.tokensPerSecond)
      .filter((t): t is number => t !== undefined);

    return {
      avgFirstToken: firstTokenTimes.length > 0
        ? firstTokenTimes.reduce((a, b) => a + b, 0) / firstTokenTimes.length
        : 0,
      avgTotalTime: totalTimes.length > 0
        ? totalTimes.reduce((a, b) => a + b, 0) / totalTimes.length
        : 0,
      avgTokensPerSecond: tokensPerSecond.length > 0
        ? tokensPerSecond.reduce((a, b) => a + b, 0) / tokensPerSecond.length
        : 0,
    };
  }

  cleanup(requestId: string): void {
    this.metrics.delete(requestId);
  }

  clear(): void {
    this.metrics.clear();
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Hook for easy integration with React components
export function usePerformanceMonitor(requestId?: string) {
  const monitor = performanceMonitor;

  return {
    startRequest: (id = requestId || 'default') => monitor.startRequest(id),
    recordFirstToken: (id = requestId || 'default') => monitor.recordFirstToken(id),
    recordStreamComplete: (id = requestId || 'default', tokenCount?: number) =>
      monitor.recordStreamComplete(id, tokenCount),
    getMetrics: (id = requestId || 'default') => monitor.getMetrics(id),
    logMetrics: (id = requestId || 'default') => monitor.logMetrics(id),
    cleanup: (id = requestId || 'default') => monitor.cleanup(id),
  };
}