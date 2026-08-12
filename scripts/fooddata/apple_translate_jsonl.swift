#!/usr/bin/env swift

import Foundation
import Translation

struct TranslationInput: Codable {
    let id: String
    let text: String
}

struct TranslationOutput: Codable {
    let id: String
    let translatedText: String
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    Foundation.exit(1)
}

let decoder = JSONDecoder()
let encoder = JSONEncoder()
let inputData = FileHandle.standardInput.readDataToEndOfFile()
guard let inputText = String(data: inputData, encoding: .utf8) else {
    fail("翻译输入不是 UTF-8")
}

let inputs: [TranslationInput]
do {
    inputs = try inputText.split(separator: "\n").map {
        try decoder.decode(TranslationInput.self, from: Data($0.utf8))
    }
} catch {
    fail("翻译输入 JSONL 解析失败：\(error)")
}

Task {
    guard #available(macOS 26.4, *) else {
        fail("Apple 系统批量翻译需要 macOS 26.4 或更高版本")
    }
    do {
        let source = Locale.Language(identifier: "en")
        let target = Locale.Language(identifier: "zh-Hans")
        let availability = LanguageAvailability(preferredStrategy: .highFidelity)
        let status = await availability.status(from: source, to: target)
        guard status == .installed else {
            fail("英文到简体中文语言包尚未安装：\(status)")
        }
        let session = TranslationSession(
            installedSource: source,
            target: target,
            preferredStrategy: .highFidelity
        )
        for start in stride(from: 0, to: inputs.count, by: 64) {
            let end = min(start + 64, inputs.count)
            let requests = inputs[start..<end].map {
                TranslationSession.Request(sourceText: $0.text, clientIdentifier: $0.id)
            }
            let responses = try await session.translations(from: requests)
            var translatedByID: [String: String] = [:]
            for response in responses {
                guard let identifier = response.clientIdentifier else {
                    fail("系统翻译响应缺少 clientIdentifier")
                }
                translatedByID[identifier] = response.targetText
            }
            guard translatedByID.count == requests.count else {
                fail("系统翻译批次返回数量不完整：\(translatedByID.count)/\(requests.count)")
            }
            for input in inputs[start..<end] {
                let output = TranslationOutput(
                    id: input.id,
                    translatedText: translatedByID[input.id]!
                )
                FileHandle.standardOutput.write(try encoder.encode(output))
                FileHandle.standardOutput.write(Data("\n".utf8))
            }
            FileHandle.standardError.write(Data("已翻译 \(end)/\(inputs.count)\n".utf8))
        }
        Foundation.exit(0)
    } catch {
        fail("Apple 系统翻译失败：\(error)")
    }
}

RunLoop.current.run()
