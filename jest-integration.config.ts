// Extensão explícita: o Jest carrega esta config via import ESM nativo do
// Node (type stripping), que não resolve import sem extensão.
import config from './jest.config.ts';

config.testMatch = ['**/*.integration.ts'];

export default config;
