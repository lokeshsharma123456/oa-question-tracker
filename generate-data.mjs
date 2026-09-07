import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const archiveRoot = path.resolve(projectRoot, '..', 'OA-questions', 'questions')
const outputPath = path.join(projectRoot, 'src', 'data', 'questions.json')

const directories = (await readdir(archiveRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name))

const questions = []

for (const directory of directories) {
  const directoryPath = path.join(archiveRoot, directory.name)
  const files = (await readdir(directoryPath))
    .filter((file) => file.endsWith('.md'))
    .sort()

  for (const file of files) {
    const source = await readFile(path.join(directoryPath, file), 'utf8')
    const { data, content } = matter(source)

    if (!data.id || !data.title) {
      throw new Error(`Missing id or title in ${directory.name}/${file}`)
    }

    const timeComplexity = content.match(/\*\*(?:Expected\s+)?time(?:\s+complexity)?:\*\*\s*([^\r\n]+)/i)?.[1]?.trim() ?? null
    const spaceComplexity = content.match(/\*\*(?:Expected\s+)?space(?:\s+complexity)?:\*\*\s*([^\r\n]+)/i)?.[1]?.trim() ?? null

    questions.push({
      id: String(data.id),
      company: String(data.company ?? directory.name),
      companyKey: String(data.company_key ?? directory.name),
      title: String(data.title),
      type: String(data.question_type ?? 'coding'),
      difficulty: String(data.difficulty ?? 'unknown').toLowerCase(),
      topics: Array.isArray(data.topics) ? data.topics.map(String) : [],
      techniques: Array.isArray(data.techniques) ? data.techniques.map(String) : [],
      dataStructures: Array.isArray(data.data_structures) ? data.data_structures.map(String) : [],
      capturedAt: data.captured_at ? String(data.captured_at) : null,
      timeComplexity,
      spaceComplexity,
      markdown: content.trim(),
    })
  }
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(questions, null, 2)}\n`, 'utf8')

const withTime = questions.filter((question) => question.timeComplexity).length
const withSpace = questions.filter((question) => question.spaceComplexity).length
console.log(`Generated ${questions.length} questions from ${directories.length} collections.`)
console.log(`Complexity coverage: ${withTime} time, ${withSpace} space.`)