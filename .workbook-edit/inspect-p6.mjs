import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const path = 'D:/Projects/TrainingManagementSystem/Docs/FeatureList/培训管理系统功能清单.xlsx';
const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
for (const [sheetName, range] of [['标准功能清单','A96:N97'],['详细原子功能','A359:O365'],['使用说明','A8:F12']]) {
  const r = await wb.inspect({ kind: 'region', sheetId: sheetName, range, maxChars: 24000 });
  console.log(`---${sheetName}!${range}---`); console.log(r.ndjson);
}
console.log(JSON.stringify(wb.worksheets.getItem('标准功能清单').getRange('A96:N97').values));
console.log(JSON.stringify(wb.worksheets.getItem('详细原子功能').getRange('A359:O365').values));
console.log(JSON.stringify(wb.worksheets.getItem('标准功能清单').getRange('A1:N3').values));
console.log(JSON.stringify(wb.worksheets.getItem('详细原子功能').getRange('A1:O3').values));
console.log(JSON.stringify(wb.worksheets.getItem('标准功能清单').getRange('A4:N5').values));
console.log(JSON.stringify(wb.worksheets.getItem('详细原子功能').getRange('A4:O5').values));
