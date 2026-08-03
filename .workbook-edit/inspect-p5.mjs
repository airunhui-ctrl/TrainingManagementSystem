import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load('D:/Projects/TrainingManagementSystem/Docs/FeatureList/培训管理系统功能清单.xlsx'));
console.log((await wb.inspect({ kind: 'match', searchTerm: 'WEB-ENR-00[23]', options: { useRegex: true, maxResults: 80 }, maxChars: 10000 })).ndjson);
