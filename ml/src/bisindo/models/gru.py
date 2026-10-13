"""BiGRU + attention pooling classifier over skeleton feature sequences."""
from __future__ import annotations

import torch
from torch import nn


class SignGRU(nn.Module):
    def __init__(self, in_dim: int, n_classes: int, hidden: int = 128, layers: int = 2,
                 embed_dim: int = 256, dropout: float = 0.3):
        super().__init__()
        # Input standardization (filled from training data, exported with the model).
        self.register_buffer("mu", torch.zeros(in_dim))
        self.register_buffer("sigma", torch.ones(in_dim))
        self.proj = nn.Sequential(
            nn.Linear(in_dim, hidden * 2), nn.LayerNorm(hidden * 2), nn.GELU(), nn.Dropout(dropout)
        )
        self.gru = nn.GRU(hidden * 2, hidden, num_layers=layers, batch_first=True,
                          bidirectional=True, dropout=dropout if layers > 1 else 0.0)
        self.attn = nn.Linear(hidden * 2, 1)
        self.embed = nn.Sequential(nn.Linear(hidden * 4, embed_dim), nn.GELU(), nn.Dropout(dropout))
        self.head = nn.Linear(embed_dim, n_classes)

    def set_normalization(self, mu: torch.Tensor, sigma: torch.Tensor) -> None:
        self.mu.copy_(mu)
        self.sigma.copy_(torch.clamp(sigma, min=1e-3))

    def forward(self, x: torch.Tensor):
        """x [B,T,D] -> (logits [B,C], embedding [B,E])."""
        x = (x - self.mu) / self.sigma
        h, _ = self.gru(self.proj(x))                       # [B,T,2H]
        w = torch.softmax(self.attn(h).squeeze(-1), dim=1)  # [B,T]
        attn_pool = (h * w.unsqueeze(-1)).sum(1)
        mean_pool = h.mean(1)
        e = self.embed(torch.cat([attn_pool, mean_pool], dim=-1))
        return self.head(e), e
