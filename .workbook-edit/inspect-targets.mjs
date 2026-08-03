import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const input = await FileBlob.load('D:/Projects/TrainingManagementSystem/Docs/FeatureList/培训管理系统功能清单.xlsx');
const wb = await SpreadsheetFile.importXlsx(input);
for (const [sheetName, range] of [['标准功能清单','A98:N109'],['详细原子功能','A380:O406'],['使用说明','A8:F12']]) {
  const r = await wb.inspect({ kind: 'region', sheetId: sheetName, range, maxChars: 24000 });
  console.log(`---${sheetName}!${range}---`); console.log(r.ndjson);
}
