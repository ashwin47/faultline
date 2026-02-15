<template>
  <div
    :class="[
      'flex max-w-5xl mx-auto',
      message.messageType === 'note' ? 'justify-end' :
      message.role === 'user' ? 'justify-end' : 'justify-start',
    ]"
  >
    <div
      :class="[
        'w-full text-sm',
        message.messageType === 'note'
          ? 'max-w-xl border-l-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-4 py-3'
          : message.role === 'user'
            ? 'bg-black dark:bg-white text-white dark:text-black px-4 py-3 max-w-xl'
            : '',
      ]"
    >
      <!-- Private note -->
      <template v-if="message.messageType === 'note'">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400/20 text-amber-600 dark:text-amber-400 text-[10px] font-medium">
            N
          </span>
          <span class="text-[11px] font-medium text-amber-600 dark:text-amber-400">Private note</span>
        </div>
        <div class="whitespace-pre-wrap text-black dark:text-white"><template v-for="(seg, si) in noteSegments" :key="si"><span v-if="seg.type === 'mention'" class="inline-flex items-center px-1 py-0.5 rounded bg-amber-200/60 dark:bg-amber-700/40 text-amber-800 dark:text-amber-200 text-xs font-medium">@{{ seg.value }}</span><template v-else>{{ seg.value }}</template></template></div>
        <div class="text-xs mt-2 text-amber-600/50 dark:text-amber-400/50">
          {{ formatTimestamp(message.createdAt) }}
        </div>
      </template>

      <!-- User messages: simple -->
      <template v-else-if="message.role === 'user'">
        <div class="whitespace-pre-wrap">{{ message.content }}</div>
        <div class="text-xs mt-2 text-white/60 dark:text-black/60">
          {{ formatTimestamp(message.createdAt) }}
        </div>
      </template>

      <!-- Tool use message (own row) -->
      <template v-else-if="message.messageType === 'tool_use' && singleToolUse">
        <ToolUsageIndicator :tool-use="singleToolUse" />
      </template>

      <!-- Evaluation message (own row) -->
      <template v-else-if="message.messageType === 'evaluation' && singleReasoning">
        <div class="border-l-2 border-black/15 dark:border-white/15 pl-3 py-1.5 text-xs text-black/70 dark:text-white/70">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-medium text-black/50 dark:text-white/50">Evaluation</span>
            <span class="tabular-nums">{{ singleReasoning.evaluation.confidence }}%</span>
            <span class="uppercase tracking-wider text-[10px] text-black/40 dark:text-white/40">{{ singleReasoning.evaluation.status }}</span>
          </div>
          <p class="leading-relaxed">{{ singleReasoning.evaluation.summary }}</p>
        </div>
      </template>

      <!-- Assistant text messages -->
      <template v-else-if="message.role === 'assistant'">
        <div
          v-if="message.content"
          class="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded prose-pre:overflow-x-auto prose-pre:text-xs prose-pre:leading-relaxed prose-code:text-xs prose-code:before:content-none prose-code:after:content-none prose-table:border prose-table:border-gray-200 dark:prose-table:border-gray-700 prose-th:border prose-th:border-gray-200 dark:prose-th:border-gray-700 prose-th:px-3 prose-th:py-1.5 prose-td:border prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-td:px-3 prose-td:py-1.5"
          v-html="renderMarkdown(message.content)"
        />

        <div class="flex items-center mt-3">
          <span class="text-xs text-black/30 dark:text-white/30">
            {{ formatTimestamp(message.createdAt) }}
          </span>
          <button
            v-if="message.content"
            @click="copyContent"
            class="ml-3 text-black/20 dark:text-white/20 hover:text-black dark:hover:text-white transition-colors"
            :class="{ '!text-green-500': contentCopied }"
            title="Copy content"
          >
            <ClipboardDocumentIcon v-if="!contentCopied" class="w-3.5 h-3.5" />
            <ClipboardDocumentCheckIcon v-else class="w-3.5 h-3.5" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import MarkdownIt from 'markdown-it';
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '@heroicons/vue/24/outline';
import ToolUsageIndicator from './ToolUsageIndicator.vue';
import type { Message, Mention, ToolUse, EvaluationResult } from '../types';

const props = defineProps<{
  message: Message;
}>();

// ── Single tool_use / evaluation message helpers ──

const singleToolUse = computed<ToolUse | null>(() => {
  if (props.message.messageType !== 'tool_use' || !props.message.toolUses) return null;
  return props.message.toolUses;
});

const singleReasoning = computed<{ iteration: number; evaluation: EvaluationResult } | null>(() => {
  if (props.message.messageType !== 'evaluation' || !props.message.reasoning) return null;
  return props.message.reasoning;
});

// ── Mention parsing ──

interface ContentSegment {
  type: 'text' | 'mention';
  value: string;
  userId?: string;
}

const noteSegments = computed<ContentSegment[]>(() => {
  const content = props.message.content || '';
  const mentions = props.message.mentions;
  if (!mentions || mentions.length === 0) {
    return [{ type: 'text', value: content }];
  }

  // Build a regex that matches any @Name from the mentions list
  const names = mentions.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`@(${names.join('|')})`, 'g');

  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    const mentionName = match[1];
    const mention = mentions.find((m) => m.name === mentionName);
    segments.push({ type: 'mention', value: mentionName, userId: mention?.userId });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments;
});

// ── Markdown / utilities ──

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
});

function renderMarkdown(content: string): string {
  return md.render(content);
}

function formatTimestamp(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const contentCopied = ref(false);
function copyContent() {
  if (!props.message.content) return;
  navigator.clipboard.writeText(props.message.content).then(() => {
    contentCopied.value = true;
    setTimeout(() => { contentCopied.value = false; }, 1500);
  });
}
</script>
