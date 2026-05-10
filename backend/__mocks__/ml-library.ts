export const linearRegression = jest.fn(() => (input: number[]) => 10);
export const logisticRegression = jest.fn(() => (input: number[]) => 0.7);
export const timeSeriesForecast = jest.fn(() => [1, 2, 3]);
export const linearProgramming = jest.fn(() => ({ optimal: [1, 0, 0], value: 42 }));
