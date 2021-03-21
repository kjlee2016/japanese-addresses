#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const https = require('https')

const unzip = require('unzipper')
const Encoding = require('encoding-japanese')
const csvParse = require('csv-parse/lib/sync')
const cliProgress = require('cli-progress')

const geohash = require('ngeohash');

const dataDir = path.join(path.dirname(path.dirname(__filename)), 'data')

const isjRenames = [
    {pref: '兵庫県', orig: '篠山市', renamed: '丹波篠山市'},
    {pref: '福岡県', orig: '筑紫郡那珂川町', renamed: '那珂川市'},
]

const isjPostalMappings = [
    {pref: '青森県', postal: '東津軽郡外ヶ浜町', isj: '東津軽郡外ケ浜町'},
    {pref: '茨城県', postal: '龍ケ崎市', isj: '龍ヶ崎市'},
    {pref: '千葉県', postal: '鎌ケ谷市', isj: '鎌ヶ谷市'},
    {pref: '千葉県', postal: '袖ケ浦市', isj: '袖ヶ浦市'},
    {pref: '東京都', postal: '三宅島三宅村', isj: '三宅村',
     kana: 'ミヤケムラ', rome: 'MIYAKE MURA'},
    {pref: '東京都', postal: '八丈島八丈町', isj: '八丈町',
     kana: 'ハチジョウマチ', rome: 'HACHIJO MACHI'},
    {pref: '滋賀県', postal: '犬上郡多賀町', isj: '犬上郡大字多賀町',
     kana: 'イヌカミグンオオアザタガチョウ', rome: 'INUKAMI GUN OAZA TAGA CHO'},
    {pref: '福岡県', postal: '糟屋郡須惠町', isj: '糟屋郡須恵町'},
]

const han2zenMap = {
  ｶﾞ: 'ガ',
  ｷﾞ: 'ギ',
  ｸﾞ: 'グ',
  ｹﾞ: 'ゲ',
  ｺﾞ: 'ゴ',
  ｻﾞ: 'ザ',
  ｼﾞ: 'ジ',
  ｽﾞ: 'ズ',
  ｾﾞ: 'ゼ',
  ｿﾞ: 'ゾ',
  ﾀﾞ: 'ダ',
  ﾁﾞ: 'ヂ',
  ﾂﾞ: 'ヅ',
  ﾃﾞ: 'デ',
  ﾄﾞ: 'ド',
  ﾊﾞ: 'バ',
  ﾋﾞ: 'ビ',
  ﾌﾞ: 'ブ',
  ﾍﾞ: 'ベ',
  ﾎﾞ: 'ボ',
  ﾊﾟ: 'パ',
  ﾋﾟ: 'ピ',
  ﾌﾟ: 'プ',
  ﾍﾟ: 'ペ',
  ﾎﾟ: 'ポ',
  ｳﾞ: 'ヴ',
  ﾜﾞ: 'ヷ',
  ｦﾞ: 'ヺ',
  ｱ: 'ア',
  ｲ: 'イ',
  ｳ: 'ウ',
  ｴ: 'エ',
  ｵ: 'オ',
  ｶ: 'カ',
  ｷ: 'キ',
  ｸ: 'ク',
  ｹ: 'ケ',
  ｺ: 'コ',
  ｻ: 'サ',
  ｼ: 'シ',
  ｽ: 'ス',
  ｾ: 'セ',
  ｿ: 'ソ',
  ﾀ: 'タ',
  ﾁ: 'チ',
  ﾂ: 'ツ',
  ﾃ: 'テ',
  ﾄ: 'ト',
  ﾅ: 'ナ',
  ﾆ: 'ニ',
  ﾇ: 'ヌ',
  ﾈ: 'ネ',
  ﾉ: 'ノ',
  ﾊ: 'ハ',
  ﾋ: 'ヒ',
  ﾌ: 'フ',
  ﾍ: 'ヘ',
  ﾎ: 'ホ',
  ﾏ: 'マ',
  ﾐ: 'ミ',
  ﾑ: 'ム',
  ﾒ: 'メ',
  ﾓ: 'モ',
  ﾔ: 'ヤ',
  ﾕ: 'ユ',
  ﾖ: 'ヨ',
  ﾗ: 'ラ',
  ﾘ: 'リ',
  ﾙ: 'ル',
  ﾚ: 'レ',
  ﾛ: 'ロ',
  ﾜ: 'ワ',
  ｦ: 'ヲ',
  ﾝ: 'ン',
  ｧ: 'ァ',
  ｨ: 'ィ',
  ｩ: 'ゥ',
  ｪ: 'ェ',
  ｫ: 'ォ',
  ｯ: 'ッ',
  ｬ: 'ャ',
  ｭ: 'ュ',
  ｮ: 'ョ',
  '｡': '。',
  '､': '、',
  ｰ: 'ー',
  '｢': '「',
  '｣': '」',
  '･': '・',
}
const han2zen = str => {
  let reg = new RegExp('(' + Object.keys(han2zenMap).join('|') + ')', 'g')
  return str
    .replace(reg, match => han2zenMap[match])
}

const normalizePostalValue = text => {
  // return text
  return text.replace('　', '').trim()
}

const getPostalKanaOrRomeItems = (
  prefName,
  cityName,
  areaName,
  postalCodeKanaOrRomeItems,
  postalKanaOrRomeCityFieldName,
  altKanaOrRomeCityFieldName,
) => {
  const postalAlt = isjPostalMappings.find(
    ({pref, isj}) =>
      (pref === prefName &&
       isj === cityName)
  )

  if (postalAlt) {
    let postalRecord = postalCodeKanaOrRomeItems.find(
      item =>
        item['都道府県名'] === prefName &&
        item['市区町村名'] === postalAlt.postal &&
        areaName.startsWith(item['町域名'])
    )
    if (!postalRecord) {
      postalRecord = postalCodeKanaOrRomeItems.find(
        item =>
          item['都道府県名'] === prefName &&
          item['市区町村名'] === postalAlt.postal
      )
    }

    if (postalRecord && postalAlt[altKanaOrRomeCityFieldName]) {
      postalRecord[postalKanaOrRomeCityFieldName] = postalAlt[altKanaOrRomeCityFieldName]
    }

    return postalRecord
  } else {
    let postalRecord = postalCodeKanaOrRomeItems.find(
      item =>
        item['都道府県名'] === prefName &&
        item['市区町村名'] === cityName &&
        areaName.startsWith(item['町域名'])
    )
    if (!postalRecord) {
      postalRecord = postalCodeKanaOrRomeItems.find(
        item =>
          item['都道府県名'] === prefName &&
          item['市区町村名'] === cityName
      )
    }
    return postalRecord
  }
}

const downloadPostalCodeKana = () => {
  return new Promise((resolve, reject) => {
    const url =
      'https://www.post.japanpost.jp/zipcode/dl/kogaki/zip/ken_all.zip'
    const csvPath = `${dataDir}/postalcode.csv`
    https.get(url, res => {
      res
        .pipe(unzip.Parse())
        .on('entry', entry => {
          entry
            .pipe(fs.createWriteStream(csvPath))
            .on('finish', () => {
              fs.readFile(csvPath, (error, buffer) => {
                if (error) {
                  reject(error)
                } else {
                  const text = Encoding.convert(buffer, {
                    from: 'SJIS',
                    to: 'UNICODE',
                    type: 'string',
                  })
                  const json = csvParse(text, {
                    columns: [
                      '全国地方公共団体コード',
                      '（旧）郵便番号',
                      '郵便番号',
                      '都道府県名カナ',
                      '市区町村名カナ',
                      '町域名カナ',
                      '都道府県名',
                      '市区町村名',
                      '町域名',
                      'hasMulti',
                      'hasBanchiOnAza',
                      'hasChomome',
                      'hasAlias',
                      'update',
                      'updateReason',
                    ],
                  }).map(item => ({
                    ...item,
                    市区町村名: normalizePostalValue(item['市区町村名']),
                  }))
                  resolve(json)
                }
              })
            })
            .on('error', error => reject(error))
        })
        .on('error', error => reject(error))
    })
  })
}

const downloadPostalCodeRome = () => {
  return new Promise((resolve, reject) => {
    const url =
      'https://www.post.japanpost.jp/zipcode/dl/roman/ken_all_rome.zip'
    const csvPath = `${dataDir}/postalcode-rome.csv`
    https.get(url, res => {
      res
        .pipe(unzip.Parse())
        .on('entry', entry => {
          entry
            .pipe(fs.createWriteStream(csvPath))
            .on('finish', () => {
              fs.readFile(csvPath, (error, buffer) => {
                if (error) {
                  reject(error)
                } else {
                  const text = Encoding.convert(buffer, {
                    from: 'SJIS',
                    to: 'UNICODE',
                    type: 'string',
                  })
                  const json = csvParse(text, {
                    columns: [
                      '郵便番号',
                      '都道府県名',
                      '市区町村名',
                      '町域名',
                      '都道府県名ローマ字',
                      '市区町村名ローマ字',
                      '町域名ローマ字',
                    ],
                  }).map(item => ({
                    ...item,
                    市区町村名: normalizePostalValue(item['市区町村名']),
                  }))
                  resolve(json)
                }
              })
            })
            .on('error', error => reject(error))
        })
        .on('error', error => reject(error))
    })
  })
}

const getAddressItems = (
  prefCode,
  postalCodeKanaItems,
  postalCodeRomeItems,
) => {
  return new Promise(resolve => {
    const records = []
    const url = `https://nlftp.mlit.go.jp/isj/dls/data/13.0b/${prefCode}000-13.0b.zip`

    https.get(url, res => {
      res.pipe(unzip.Parse()).on('entry', entry => {
        const entryPath = path.join(dataDir, entry.path)
        if (entry.type === 'Directory') {
          try {
            fs.mkdirSync(entryPath)
          } catch (error) {
            // already exists
          }
        } else if (entry.path.slice(-4) === '.csv') {
          entry.pipe(
            fs.createWriteStream(entryPath).on('finish', () => {
              const buffer = fs.readFileSync(entryPath)
              const text = Encoding.convert(buffer, {
                from: 'SJIS',
                to: 'UNICODE',
                type: 'string',
              })

              const data = csvParse(text, {
                columns: true,
                skip_empty_lines: true,
              })

              let hit = 0
              let nohit = 0
              const nohitCases = {}

              const bar = new cliProgress.SingleBar()
              bar.start(data.length, 0)

              data.forEach((line, index) => {
                bar.update(index + 1)

                const renameEntry =
                  isjRenames.find(
                    ({pref, orig}) =>
                      (pref === line['都道府県名'] &&
                       orig === line['市区町村名']))
                const cityName = renameEntry ? renameEntry.renamed : line['市区町村名']
                const areaName = line['大字町丁目名'];

                const postalCodeKanaItem = getPostalKanaOrRomeItems(
                  line['都道府県名'], cityName, areaName, postalCodeKanaItems, '市区町村名カナ', 'kana'
                )
                const postalCodeRomeItem = getPostalKanaOrRomeItems(
                  line['都道府県名'], cityName, areaName, postalCodeRomeItems, '市区町村名ローマ字', 'rome'
                )

                if (postalCodeKanaItem && postalCodeRomeItem) {
                  hit++
                } else {
                  nohit++
                  nohitCases[line['都道府県名'] + cityName] = true
                }

                // NOTE: lat: latitude: 緯度
                // NOTE: lon: longitude: 経度
                const lat = line['緯度'];
                const lon = line['経度'];
                // NOTE: geohash.encode (latitude, longitude, precision=9)
                // [緯度経度:小数点桁数と精度の関係](https://qiita.com/y-ken/items/55d8e90d1a826391cda8#%E5%B0%8F%E6%95%B0%E7%82%B9%E6%A1%81%E6%95%B0%E3%81%A8%E7%B2%BE%E5%BA%A6%E3%81%AE%E9%96%A2%E4%BF%82)
                // [GeoHash:精度について](https://qiita.com/yabooun/items/da59e47d61ddff141f0c#%E7%B2%BE%E5%BA%A6%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6)
                const geohashCode = geohash.encode(lat, lon); // NOTE: prints ww8p1r4t8

                const record = [
                  line['都道府県コード'],
                  line['都道府県名'],
                  postalCodeKanaItem
                    ? han2zen(postalCodeKanaItem['都道府県名カナ'])
                    : '',
                  postalCodeRomeItem
                    ? postalCodeRomeItem['都道府県名ローマ字']
                    : '',
                  line['市区町村コード'],
                  cityName,
                  postalCodeKanaItem
                    ? han2zen(postalCodeKanaItem['市区町村名カナ'])
                    : '',
                  postalCodeRomeItem
                    ? postalCodeRomeItem['市区町村名ローマ字']
                    : '',
                  postalCodeKanaItem['郵便番号'],
                  line['大字町丁目コード'],
                  areaName,
                  line['緯度'],
                  line['経度'],
                  geohashCode,
                ]
                  .map(item =>
                    item && typeof item === 'string' ? `"${item}"` : item,
                  )
                  .join(',')

                records.push(record)
              }) // line iteration
              bar.stop()
              const summary = { prefCode, hit, nohit, nohitCases: Object.keys(nohitCases) }
              resolve({ records, summary })
            }),
          )
        }
      }) // http.get response pipe event
    }) // http.get callback
  })
}

const main = async () => {
  process.stderr.write('郵便番号辞書のダウンロード中...')
  const postalCodeKanaItems = await downloadPostalCodeKana()
  const postalCodeRomeItems = await downloadPostalCodeRome()
  process.stderr.write('done\n')

  const finalOutput = [
    [
      '"都道府県コード"',
      '"都道府県名"',
      '"都道府県名カナ"',
      '"都道府県名ローマ字"',
      '"市区町村コード"',
      '"市区町村名"',
      '"市区町村名カナ"',
      '"市区町村名ローマ字"',
      '"郵便番号"',
      '"大字町丁目コード"',
      '"大字町丁目名"',
      '"緯度"',
      '"経度"',
      '"GeoHash"',
    ].join(','),
  ]

  const promises = []
  // NOTE: 都道府県単位の繰り返し(1~47)
  const startPref = 1;
  const endPref = 47;
  for (let i = startPref; i < (endPref+1); i++) {
    let prefCode = i.toString()
    if (i < 10) {
      prefCode = `0${prefCode}`
    }
    // process.stderr.write(`memoryUsed: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB\n`)

    const promise = getAddressItems(
      prefCode,
      postalCodeKanaItems,
      postalCodeRomeItems,
    ).then(data => {
      console.log(data)
      finalOutput.push(...data.records)
      process.stderr.write(JSON.stringify({ summary: data.summary }) + '\n')
    })

    if (process.env.CONCURRENCY === 'true') {
      promises.push(promise)
    } else {
      await promise
    }
  } // pref loop

  if (process.env.CONCURRENCY === 'true') {
    await Promise.all(promises)
  }
  fs.writeFileSync(path.join(dataDir, 'latest.csv'), finalOutput.join('\n'))
}

try {
  fs.mkdirSync(dataDir)
} catch (error) {
  // already exists
}

main()
