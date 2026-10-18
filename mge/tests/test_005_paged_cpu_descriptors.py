from pathlib import Path
import unittest
NATIVE=Path(__file__).resolve().parents[2]/'native'/'monogame'
def code(name): return (NATIVE/name).read_text(encoding='utf-8-sig')
class Pages(unittest.TestCase):
 def test_capacity_and_query_preserved(self):
  h=code('directx12/Heaps.h');s=code('directx12/Heaps.cpp')
  self.assertIn('PageSize = 4096;',h)
  self.assertIn('std::unique_ptr<PagedCpuDescHeap> m_srvHeap;',h)
  self.assertIn('std::make_unique<PagedCpuDescHeap>(device, 1 << 16)',s)
  self.assertIn('D3D12_QUERY_HEAP_TYPE_OCCLUSION, 1024',s)
  self.assertNotIn('EnsureQueryHeap',s)
  a=s.split('PagedCpuDescHeap::AllocCpuHandle()',1)[1].split('PagedCpuDescHeap::FreeCpuHandle',1)[0]
  self.assertLess(a.index('CreateDescriptorHeap'),a.index('++m_next'))
