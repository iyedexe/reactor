from setuptools import setup

setup(
    name='reactor',
    version='1.0.0',    
    description='A consumer producer example over TCP',
    url='https://github.com/iyedexe/reactor',
    author='Iyed BEN REJEB',
    author_email='iyed.exe@gmail.com',
    license='BSD 2-clause',
    packages=['reactor'],
    install_requires=['asyncio',
                      'numpy'                     
                      ],

    classifiers=[
        'Development Status :: 1 - Planning',
        'Intended Audience :: Science/Research',
        'License :: OSI Approved :: BSD License',  
        'Operating System :: POSIX :: Linux',        
        'Programming Language :: Python :: 2',
        'Programming Language :: Python :: 2.7',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.4',
        'Programming Language :: Python :: 3.5',
    ],
)
