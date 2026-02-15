const runtimeEnv = (process.env.APP_RUNTIME_ENV || 'test').toLowerCase();

export const isProductionRuntime = (): boolean => runtimeEnv === 'production';
