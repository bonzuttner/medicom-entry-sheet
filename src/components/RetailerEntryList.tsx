import React, { useState } from 'react';
import { EntrySheet, User, ReviewComment } from '../types';
import {
  Eye,
  Search,
  FileWarning,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  RotateCcw,
  MessageSquare,
  X,
  Clock,
} from 'lucide-react';
import { getWorkflowStatusView } from '../lib/sheetWorkflow';
import { dataService } from '../services/dataService';

interface RetailerEntryListProps {
  sheets: EntrySheet[];
  currentUser: User;
  onView: (sheet: EntrySheet) => void;
  onRefresh: () => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  totalCount?: number;
}

export const RetailerEntryList: React.FC<RetailerEntryListProps> = ({
  sheets,
  currentUser,
  onView,
  onRefresh,
  hasMore = false,
  onLoadMore,
  isLoadingMore = false,
  totalCount = 0,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSheets, setExpandedSheets] = useState<Set<string>>(new Set());
  const [reviewModalSheet, setReviewModalSheet] = useState<EntrySheet | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'request_revision' | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentsCache, setCommentsCache] = useState<Record<string, ReviewComment[]>>({});
  const [loadingComments, setLoadingComments] = useState<Set<string>>(new Set());

  const pageTitleClass = 'text-2xl font-bold tracking-tight text-slate-800';
  const pageSubtitleClass = 'mt-1 text-sm text-slate-500';
  const searchInputClass =
    'block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm leading-5 shadow-sm placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary';

  const getDisplaySheetId = (sheet: EntrySheet): string =>
    sheet.sheetCode?.trim() || sheet.id.slice(0, 8);

  const toggleExpand = async (sheetId: string) => {
    const newExpanded = new Set(expandedSheets);
    if (newExpanded.has(sheetId)) {
      newExpanded.delete(sheetId);
    } else {
      newExpanded.add(sheetId);
      // Load comments if not cached
      if (!commentsCache[sheetId] && !loadingComments.has(sheetId)) {
        setLoadingComments((prev) => new Set(prev).add(sheetId));
        try {
          const comments = await dataService.getReviewComments(sheetId);
          setCommentsCache((prev) => ({ ...prev, [sheetId]: comments }));
        } catch (error) {
          console.error('Failed to load comments:', error);
        } finally {
          setLoadingComments((prev) => {
            const next = new Set(prev);
            next.delete(sheetId);
            return next;
          });
        }
      }
    }
    setExpandedSheets(newExpanded);
  };

  const canReview = (sheet: EntrySheet): boolean => {
    return sheet.status === 'completed' || sheet.status === 'completed_no_image';
  };

  const openReviewModal = (sheet: EntrySheet, action: 'approve' | 'request_revision') => {
    setReviewModalSheet(sheet);
    setReviewAction(action);
    setReviewComment('');
  };

  const closeReviewModal = () => {
    setReviewModalSheet(null);
    setReviewAction(null);
    setReviewComment('');
  };

  const handleSubmitReview = async () => {
    if (!reviewModalSheet || !reviewAction) return;
    if (reviewAction === 'request_revision' && !reviewComment.trim()) {
      alert('修正依頼にはコメントが必要です。');
      return;
    }

    setIsSubmitting(true);
    try {
      await dataService.reviewSheet(
        reviewModalSheet.id,
        reviewAction,
        reviewComment.trim() || undefined
      );
      // Clear cache for this sheet to reload comments
      setCommentsCache((prev) => {
        const next = { ...prev };
        delete next[reviewModalSheet.id];
        return next;
      });
      closeReviewModal();
      onRefresh();
    } catch (error) {
      console.error('Failed to submit review:', error);
      alert('レビューの送信に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSheets = sheets.filter((sheet) => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return true;
    return (
      sheet.title.toLowerCase().includes(keyword) ||
      sheet.manufacturerName.toLowerCase().includes(keyword) ||
      sheet.products.some((product) =>
        (product.productName || '').toLowerCase().includes(keyword)
      )
    );
  });

  const loadedCount = sheets.length;
  const safeTotalCount = totalCount > 0 ? totalCount : loadedCount;

  const formatCommentDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className={pageTitleClass}>シートレビュー</h2>
          <p className={pageSubtitleClass}>
            担当メーカーのエントリーシートを確認・承認できます
          </p>
        </div>
      </div>

      <div className="relative w-full">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-4 w-4 text-slate-400" />
        </div>
        <input
          type="text"
          className={searchInputClass}
          placeholder="シート名、メーカー名、商品名で検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {filteredSheets.length === 0 ? (
        <div className="bg-white shadow-sm rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          <div className="inline-flex items-center justify-center p-4 bg-slate-100 rounded-full mb-4">
            <FileWarning size={32} className="text-slate-400" />
          </div>
          <p className="text-lg">エントリーシートが見つかりません</p>
          <p className="text-sm mt-2">担当メーカーのシートがここに表示されます。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSheets.map((sheet) => {
            const isExpanded = expandedSheets.has(sheet.id);
            const workflowStatus = getWorkflowStatusView(sheet);
            const comments = commentsCache[sheet.id] || [];
            const isLoadingSheetComments = loadingComments.has(sheet.id);

            return (
              <div
                key={sheet.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Card Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(sheet.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-full ${workflowStatus.pillClassName}`}
                        >
                          {workflowStatus.label}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ID: {getDisplaySheetId(sheet)}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 leading-tight mb-1">
                        {sheet.title || '（タイトル未設定）'}
                      </h3>
                      <div className="text-sm text-slate-600">
                        {sheet.manufacturerName} / {sheet.creatorName}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {sheet.products.length}商品 ・ 更新:{' '}
                        {new Date(sheet.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp size={20} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={20} className="text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t border-slate-200">
                    {/* Actions */}
                    <div className="p-4 bg-slate-50 flex flex-wrap gap-3">
                      <button
                        onClick={() => onView(sheet)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
                      >
                        <Eye size={16} />
                        詳細を見る
                      </button>
                      {canReview(sheet) && (
                        <>
                          <button
                            onClick={() => openReviewModal(sheet, 'approve')}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors"
                          >
                            <CheckCircle size={16} />
                            承認
                          </button>
                          <button
                            onClick={() => openReviewModal(sheet, 'request_revision')}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors"
                          >
                            <RotateCcw size={16} />
                            修正依頼
                          </button>
                        </>
                      )}
                      {sheet.status === 'approved' && (
                        <span className="flex items-center gap-2 px-4 py-2 text-emerald-700 font-semibold">
                          <CheckCircle size={16} />
                          承認済み
                        </span>
                      )}
                      {sheet.status === 'revision_requested' && (
                        <span className="flex items-center gap-2 px-4 py-2 text-rose-700 font-semibold">
                          <Clock size={16} />
                          修正待ち
                        </span>
                      )}
                    </div>

                    {/* Comments Section */}
                    <div className="p-4 border-t border-slate-200">
                      <div className="flex items-center gap-2 mb-3">
                        <MessageSquare size={16} className="text-slate-500" />
                        <span className="text-sm font-bold text-slate-700">
                          レビューコメント履歴
                        </span>
                      </div>
                      {isLoadingSheetComments ? (
                        <div className="text-sm text-slate-500">読み込み中...</div>
                      ) : comments.length === 0 ? (
                        <div className="text-sm text-slate-500">コメントはありません</div>
                      ) : (
                        <div className="space-y-3">
                          {comments.map((comment) => (
                            <div
                              key={comment.id}
                              className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-semibold text-slate-700">
                                  {comment.userNameSnapshot}
                                  <span className="ml-2 text-xs text-slate-500">
                                    ({comment.userRoleSnapshot === 'ADMIN'
                                      ? '管理者'
                                      : comment.userRoleSnapshot === 'RETAILER'
                                      ? '小売店'
                                      : '一般'}
                                    )
                                  </span>
                                </span>
                                <span className="text-xs text-slate-400">
                                  {formatCommentDate(comment.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                                {comment.comment}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex flex-col items-center gap-2">
          <div className="text-xs text-slate-500">
            表示: {loadedCount} / 全{safeTotalCount}件
          </div>
          <button
            onClick={() => onLoadMore?.()}
            disabled={isLoadingMore}
            className={`px-6 py-3 rounded-lg font-bold shadow-sm transition-all ${
              isLoadingMore
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {isLoadingMore ? '読み込み中...' : 'さらに読み込む'}
          </button>
        </div>
      )}

      {/* Review Modal */}
      {reviewModalSheet && reviewAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-slate-800">
                {reviewAction === 'approve' ? 'シートを承認' : '修正依頼を送信'}
              </h3>
              <button
                onClick={closeReviewModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-4 p-3 bg-slate-50 rounded-lg">
              <div className="text-sm text-slate-600">
                <strong>シート:</strong> {reviewModalSheet.title || '（タイトル未設定）'}
              </div>
              <div className="text-sm text-slate-600">
                <strong>メーカー:</strong> {reviewModalSheet.manufacturerName}
              </div>
            </div>

            {reviewAction === 'request_revision' && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  修正依頼コメント <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={4}
                  placeholder="修正が必要な点を記載してください..."
                />
              </div>
            )}

            {reviewAction === 'approve' && (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  コメント（任意）
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                  placeholder="承認時のコメント（任意）..."
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={closeReviewModal}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleSubmitReview}
                disabled={isSubmitting}
                className={`px-4 py-2.5 rounded-lg font-semibold text-white disabled:opacity-50 ${
                  reviewAction === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isSubmitting
                  ? '送信中...'
                  : reviewAction === 'approve'
                  ? '承認する'
                  : '修正依頼を送信'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
